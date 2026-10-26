/**
 * Phone number normalization for a UAE-first, international-safe product.
 *
 * The bug this solves: the same caller arrived as "0501234567" from one
 * channel and "+971501234567" from another, so the system created two
 * customer profiles and missed lookups. Every phone is now stored in one
 * canonical E.164 form.
 *
 * Rules:
 *  - UAE local numbers (05x..., 04...) become +971...
 *  - Numbers that already carry a country code keep it. A tourist's
 *    +44 or +966 number is never forced into +971.
 *  - Withheld or anonymous caller IDs become null, so anonymous callers
 *    never share one customer record.
 *
 * This is a simplified, standalone version written for this case study.
 */

const DEFAULT_COUNTRY_CODE = "971";

const ANONYMOUS_VALUES = new Set([
  "anonymous", "unknown", "private", "withheld", "restricted", "unavailable",
]);

/** Returns the number in E.164 form ("+971501234567"), or null if unusable. */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (ANONYMOUS_VALUES.has(raw.toLowerCase())) return null;

  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // Already international: "+44 7911 123456"
  } else if (digits.startsWith("00")) {
    // International dialing prefix: "00971 50 123 4567"
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    // UAE local format: "050 123 4567" or "04 123 4567"
    digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  } else if (digits.length === 9 && digits.startsWith("5")) {
    // UAE mobile typed without the leading zero: "501234567"
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  // Otherwise assume a bare international number such as "447911123456".

  // E.164 allows at most 15 digits; very short values are not real numbers.
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Strict equality after normalization, for de-duplicating customers. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = toE164(a);
  const y = toE164(b);
  return x !== null && x === y;
}
