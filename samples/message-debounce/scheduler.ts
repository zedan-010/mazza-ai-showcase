/**
 * Debounced, single-flight reply scheduling for a messaging agent.
 *
 * The problem: customers on WhatsApp send thoughts in bursts.
 *   "hi" / "do you have a white SUV" / "for this weekend" / "2 days"
 * Answering each message separately produces four confused replies, wastes
 * LLM calls, and lets two replies race each other.
 *
 * The approach, per conversation:
 *  1. Debounce: each new message pushes the reply back by a quiet window
 *     (2.5 s in production). The newest message wins.
 *  2. Single flight: a lease (a lock that expires) ensures only one worker
 *     answers a conversation at a time. The lease expiry matters: if a
 *     worker crashes mid-reply, the conversation is not stuck forever.
 *  3. Catch-up: messages that arrive WHILE a reply is being generated are
 *     not lost. When the reply finishes, the conversation is checked again
 *     and answered if anything newer is waiting.
 *
 * In production the lease is a timestamp column updated atomically in
 * Postgres (it also drives the "AI is typing" indicator), and a scheduled
 * sweeper retries conversations a dropped background task left unanswered.
 * This version uses an injectable clock and timers so it can be tested
 * deterministically.
 */

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface InboundMessage {
  conversationId: string;
  text: string;
  receivedAt: number;
}

type Reply = (conversationId: string, batch: InboundMessage[]) => Promise<void>;

interface ConversationState {
  pending: InboundMessage[];
  timer: unknown | null;
  leaseUntil: number; // 0 = not leased
}

export class ReplyScheduler {
  private conversations = new Map<string, ConversationState>();
  private reply: Reply;
  private clock: Clock;
  private quietMs: number;
  private leaseMs: number;

  constructor(reply: Reply, clock: Clock, quietMs = 2_500, leaseMs = 60_000) {
    this.reply = reply;
    this.clock = clock;
    this.quietMs = quietMs;
    this.leaseMs = leaseMs;
  }

  /** Called by the webhook. Returns immediately; the reply happens later. */
  receive(message: InboundMessage): void {
    const state = this.state(message.conversationId);
    state.pending.push(message);
    if (state.timer !== null) this.clock.clearTimeout(state.timer);
    state.timer = this.clock.setTimeout(() => {
      state.timer = null;
      void this.tryReply(message.conversationId);
    }, this.quietMs);
  }

  /** Also called by the sweeper for conversations that may have been dropped. */
  async tryReply(conversationId: string): Promise<boolean> {
    const state = this.state(conversationId);
    if (state.pending.length === 0) return false;
    if (state.timer !== null) return false; // still inside the quiet window
    if (state.leaseUntil > this.clock.now()) return false; // another worker is replying

    // Take the lease and the whole batch together, before any await.
    state.leaseUntil = this.clock.now() + this.leaseMs;
    const batch = state.pending.splice(0);
    try {
      await this.reply(conversationId, batch);
    } catch {
      // Put the batch back and leave it for the sweeper. Retrying here
      // immediately would spin in a loop while the provider is down.
      state.pending.unshift(...batch);
      return false;
    } finally {
      state.leaseUntil = 0;
    }

    // Catch-up: answer anything that arrived while we were replying.
    if (state.pending.length > 0 && state.timer === null) void this.tryReply(conversationId);
    return true;
  }

  pendingCount(conversationId: string): number {
    return this.conversations.get(conversationId)?.pending.length ?? 0;
  }

  /** Test hook to simulate a worker that crashed while holding the lease. */
  forceLease(conversationId: string, until: number): void {
    this.state(conversationId).leaseUntil = until;
  }

  private state(id: string): ConversationState {
    let s = this.conversations.get(id);
    if (!s) {
      s = { pending: [], timer: null, leaseUntil: 0 };
      this.conversations.set(id, s);
    }
    return s;
  }
}
