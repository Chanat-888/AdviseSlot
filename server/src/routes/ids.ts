// Shared `:id` rule for routes that address a row by id (F-09, F-12, F-13; review of PR #81).
// A positive whole number in plain digits that fits the INT column. Anything else ("abc", "0",
// "-1", "1.5", "007", out of range) gives null, and the route answers 400 VALIDATION_ERROR with
// its own message.
const POSITIVE_ID = /^[1-9]\d{0,9}$/;
const INT_MAX = 2147483647;

export function parseId(raw: string): number | null {
  const id = POSITIVE_ID.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(id) && id <= INT_MAX ? id : null;
}
