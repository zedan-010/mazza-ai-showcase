import { test } from "node:test";
import assert from "node:assert/strict";
import { ToolLedger, RetryableError, InvocationConflictError, stableStringify } from "./ledger.ts";

const booking = { customer: "+971501234567", service: "Haircut", start: "2026-11-02T10:00:00+04:00" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a retried call replays the saved result instead of booking twice", async () => {
  const ledger = new ToolLedger();
  let bookings = 0;
  const create = async () => ({ bookingId: `b${++bookings}` });

  const first = await ledger.run("org1", "call42:create_booking:1", booking, create);
  const retry = await ledger.run("org1", "call42:create_booking:1", booking, create);

  assert.deepEqual(first, { ok: true, data: { bookingId: "b1" }, replayed: false });
  assert.deepEqual(retry, { ok: true, data: { bookingId: "b1" }, replayed: true });
  assert.equal(bookings, 1);
});

test("two copies arriving at the same moment execute once", async () => {
  const ledger = new ToolLedger();
  const slowCreate = async () => { await sleep(20); return { bookingId: "b1" }; };

  const [a, b, c] = await Promise.all([
    ledger.run("org1", "k1", booking, slowCreate),
    ledger.run("org1", "k1", booking, slowCreate),
    ledger.run("org1", "k1", booking, slowCreate),
  ]);

  assert.equal(ledger.executions, 1);
  assert.deepEqual([a.replayed, b.replayed, c.replayed], [false, true, true]);
  assert.deepEqual(b.ok && b.data, { bookingId: "b1" });
});

test("argument order does not matter, argument values do", async () => {
  const ledger = new ToolLedger();
  await ledger.run("org1", "k1", { a: 1, b: 2 }, async () => "x");
  const same = await ledger.run("org1", "k1", { b: 2, a: 1 }, async () => "y");
  assert.equal(same.replayed, true);

  await assert.rejects(
    ledger.run("org1", "k1", { a: 1, b: 3 }, async () => "z"),
    InvocationConflictError,
  );
});

test("retryable failures can run again, permanent failures are replayed", async () => {
  const ledger = new ToolLedger();

  const timeout = await ledger.run("org1", "k1", booking, async () => { throw new RetryableError("calendar timeout"); });
  assert.equal(timeout.ok, false);
  const second = await ledger.run("org1", "k1", booking, async () => ({ bookingId: "b1" }));
  assert.deepEqual(second, { ok: true, data: { bookingId: "b1" }, replayed: false });

  const rejected = await ledger.run("org1", "k2", booking, async () => { throw new Error("slot already taken"); });
  const again = await ledger.run("org1", "k2", booking, async () => ({ bookingId: "never" }));
  assert.deepEqual(again, { ok: false, error: "slot already taken", replayed: true });
  assert.equal(rejected.replayed, false);
});

test("the same key in two organizations never collides", async () => {
  const ledger = new ToolLedger();
  const a = await ledger.run("orgA", "k1", booking, async () => "A");
  const b = await ledger.run("orgB", "k1", booking, async () => "B");
  assert.deepEqual([a.ok && a.data, b.ok && b.data], ["A", "B"]);
  assert.equal(ledger.executions, 2);
});

test("stableStringify sorts keys at every depth", () => {
  assert.equal(stableStringify({ b: { y: 1, x: 2 }, a: [3, { d: 4, c: 5 }] }), stableStringify({ a: [3, { c: 5, d: 4 }], b: { x: 2, y: 1 } }));
});
