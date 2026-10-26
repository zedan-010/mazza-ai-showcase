import { test } from "node:test";
import assert from "node:assert/strict";
import { ReplyScheduler, type Clock, type InboundMessage } from "./scheduler.ts";

/** A fake clock: time only moves when the test says so. */
class FakeClock implements Clock {
  t = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private nextId = 1;
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const id = this.nextId++; this.timers.set(id, { at: this.t + ms, fn }); return id; }
  clearTimeout(id: unknown) { this.timers.delete(id as number); }
  async advance(ms: number) {
    this.t += ms;
    for (const [id, timer] of [...this.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= this.t) { this.timers.delete(id); timer.fn(); }
    }
    await new Promise((r) => setImmediate(r)); // let replies settle
  }
}

const msg = (text: string, at: number, conversationId = "c1"): InboundMessage => ({ conversationId, text, receivedAt: at });

test("a burst of messages gets one combined reply", async () => {
  const clock = new FakeClock();
  const replies: string[][] = [];
  const s = new ReplyScheduler(async (_id, batch) => { replies.push(batch.map((m) => m.text)); }, clock);

  s.receive(msg("hi", 0));
  await clock.advance(1_000);
  s.receive(msg("do you have a white SUV", 1_000));
  await clock.advance(1_000);
  s.receive(msg("for this weekend", 2_000));
  await clock.advance(2_400);
  assert.equal(replies.length, 0, "still inside the quiet window");

  await clock.advance(200);
  assert.deepEqual(replies, [["hi", "do you have a white SUV", "for this weekend"]]);
});

test("messages arriving during a reply are answered afterwards, not lost", async () => {
  const clock = new FakeClock();
  const replies: string[][] = [];
  let release!: () => void;
  const s = new ReplyScheduler(async (_id, batch) => {
    replies.push(batch.map((m) => m.text));
    if (replies.length === 1) await new Promise<void>((r) => { release = r; }); // first reply is slow
  }, clock);

  s.receive(msg("price for 2 days?", 0));
  await clock.advance(2_500);
  assert.equal(replies.length, 1);

  s.receive(msg("actually 3 days", 3_000)); // arrives while the first reply is still running
  await clock.advance(2_500);
  assert.equal(replies.length, 1, "lease prevents a second concurrent reply");

  release();
  await clock.advance(0);
  assert.deepEqual(replies, [["price for 2 days?"], ["actually 3 days"]]);
});

test("a crashed worker's lease expires and the sweeper recovers the conversation", async () => {
  const clock = new FakeClock();
  const replies: string[][] = [];
  const s = new ReplyScheduler(async (_id, batch) => { replies.push(batch.map((m) => m.text)); }, clock, 2_500, 60_000);

  s.forceLease("c1", 60_000); // a worker took the lease, then died
  s.receive(msg("hello?", 0));
  await clock.advance(2_500);
  assert.equal(replies.length, 0);
  assert.equal(await s.tryReply("c1"), false, "lease still held");

  await clock.advance(60_000);
  assert.equal(await s.tryReply("c1"), true, "sweeper picks it up after expiry");
  assert.deepEqual(replies, [["hello?"]]);
});

test("a failed reply puts the batch back for a later retry", async () => {
  const clock = new FakeClock();
  let fail = true;
  const replies: string[][] = [];
  const s = new ReplyScheduler(async (_id, batch) => {
    if (fail) throw new Error("LLM provider timeout");
    replies.push(batch.map((m) => m.text));
  }, clock);

  s.receive(msg("book me for friday", 0));
  await clock.advance(2_500);
  assert.equal(s.pendingCount("c1"), 1);

  fail = false;
  assert.equal(await s.tryReply("c1"), true);
  assert.deepEqual(replies, [["book me for friday"]]);
});

test("conversations are independent", async () => {
  const clock = new FakeClock();
  const seen: string[] = [];
  const s = new ReplyScheduler(async (id) => { seen.push(id); }, clock);
  s.receive(msg("hi", 0, "c1"));
  s.receive(msg("hello", 0, "c2"));
  await clock.advance(2_500);
  assert.deepEqual(seen.sort(), ["c1", "c2"]);
});
