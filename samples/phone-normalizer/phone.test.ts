import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164, samePhone } from "./phone.ts";

test("UAE local mobile becomes +971", () => {
  assert.equal(toE164("050 123 4567"), "+971501234567");
  assert.equal(toE164("0501234567"), "+971501234567");
  assert.equal(toE164("501234567"), "+971501234567");
});

test("UAE landline becomes +971", () => {
  assert.equal(toE164("04 123 4567"), "+97141234567");
});

test("international numbers keep their own country", () => {
  assert.equal(toE164("+44 7911 123456"), "+447911123456");
  assert.equal(toE164("+966 50 123 4567"), "+966501234567");
  assert.equal(toE164("00971501234567"), "+971501234567");
  assert.equal(toE164("447911123456"), "+447911123456");
});

test("anonymous and invalid values become null", () => {
  for (const v of ["anonymous", "Withheld", "", "   ", null, undefined, "abc", "123"]) {
    assert.equal(toE164(v), null, String(v));
  }
});

test("the same caller from two channels is one customer", () => {
  assert.ok(samePhone("0501234567", "+971 50 123 4567"));
  assert.ok(!samePhone("0501234567", "+447911123456"));
  assert.ok(!samePhone("anonymous", "anonymous"));
});
