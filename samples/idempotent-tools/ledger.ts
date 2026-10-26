/**
 * Idempotent tool execution for AI agents.
 *
 * The problem: voice and messaging providers retry tool calls. A network
 * blip, a slow response or an interrupted turn can deliver the same
 * "create_booking" call two or three times, sometimes at the same moment.
 * Executing each delivery would create duplicate bookings.
 *
 * The approach: every tool call carries a stable invocation key. A ledger
 * records the first execution and its result:
 *  - Same key, same arguments, already finished  -> replay the saved result.
 *  - Same key, same arguments, still running     -> wait for the running call.
 *  - Same key, DIFFERENT arguments               -> refuse. That is a bug or
 *    an attack, never a retry.
 *  - Execution failed with a retryable error     -> forget it, so a later
 *    retry can run again. Permanent failures are saved and replayed, so a
 *    rejected booking is not retried forever.
 *
 * In production the ledger is a database table with a unique constraint on
 * (organization, key). This standalone version keeps the same rules with an
 * in-memory store so the behaviour is easy to read and test.
 */

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export class RetryableError extends Error {}

export class InvocationConflictError extends Error {
  constructor(key: string) {
    super(`Invocation ${key} was already used with different arguments`);
  }
}

type Entry =
  | { state: "running"; argsHash: string; promise: Promise<ToolResult> }
  | { state: "done"; argsHash: string; result: ToolResult };

/** Stable JSON so {a:1,b:2} and {b:2,a:1} hash the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export class ToolLedger {
  private entries = new Map<string, Entry>();
  /** How many times a tool body actually ran (useful for tests and metrics). */
  executions = 0;

  async run(
    orgId: string,
    invocationKey: string,
    args: unknown,
    execute: () => Promise<unknown>,
  ): Promise<ToolResult & { replayed: boolean }> {
    const key = `${orgId}:${invocationKey}`; // keys never cross tenants
    const argsHash = stableStringify(args);
    const existing = this.entries.get(key);

    if (existing) {
      if (existing.argsHash !== argsHash) throw new InvocationConflictError(invocationKey);
      const result = existing.state === "done" ? existing.result : await existing.promise;
      return { ...result, replayed: true };
    }

    // Claim the key synchronously, before any await, so a concurrent
    // duplicate sees "running" instead of starting a second execution.
    const promise = this.execute(key, argsHash, execute);
    this.entries.set(key, { state: "running", argsHash, promise });
    return { ...(await promise), replayed: false };
  }

  private async execute(key: string, argsHash: string, execute: () => Promise<unknown>): Promise<ToolResult> {
    this.executions++;
    try {
      const result: ToolResult = { ok: true, data: await execute() };
      this.entries.set(key, { state: "done", argsHash, result });
      return result;
    } catch (err) {
      const result: ToolResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
      if (err instanceof RetryableError) {
        this.entries.delete(key); // allow a later retry to run again
      } else {
        this.entries.set(key, { state: "done", argsHash, result });
      }
      return result;
    }
  }
}
