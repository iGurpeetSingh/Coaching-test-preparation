import assert from "node:assert/strict";
import test from "node:test";
import {
  ENQUIRY_STATUSES,
  canTransition,
  isEnquiryStatus,
  normalizePersonName,
  normalizePhone,
  parsePositiveInteger,
  validateFee,
  validatePhone
} from "./enquiry-domain.js";

test("enquiry statuses are recognised without accepting arbitrary values", () => {
  assert.equal(isEnquiryStatus("new"), true);
  assert.equal(isEnquiryStatus("converted"), true);
  assert.equal(isEnquiryStatus("unknown"), false);
  assert.equal(isEnquiryStatus(null), false);
  assert.ok(ENQUIRY_STATUSES.includes("admission_pending"));
});

test("enquiry state transitions enforce the configured lifecycle", () => {
  assert.equal(canTransition("new", "assigned"), true);
  assert.equal(canTransition("admission_pending", "converted"), true);
  assert.equal(canTransition("converted", "new"), false);
  assert.equal(canTransition("lost", "interested"), false);
});

test("Indian phone numbers are normalised consistently", () => {
  assert.equal(normalizePhone("+91 98765-43210"), "9876543210");
  assert.equal(normalizePhone("09876543210"), "9876543210");
  assert.equal(validatePhone("+91 98765 43210"), true);
  assert.equal(validatePhone("1234"), false);
});

test("person names use Unicode normalisation and stable whitespace", () => {
  assert.equal(normalizePersonName("  GURPREET   Singh  "), "gurpreet singh");
  assert.equal(normalizePersonName("ＡＢＣ"), "abc");
});

test("pagination input falls back on invalid values and caps large values", () => {
  assert.equal(parsePositiveInteger("25", 20, 100), 25);
  assert.equal(parsePositiveInteger("0", 20, 100), 20);
  assert.equal(parsePositiveInteger("-2", 20, 100), 20);
  assert.equal(parsePositiveInteger("2.5", 20, 100), 20);
  assert.equal(parsePositiveInteger("500", 20, 100), 100);
  assert.equal(parsePositiveInteger(undefined, 20, 100), 20);
});

test("fee calculation rounds to paise and prevents over-discounting", () => {
  assert.deepEqual(validateFee(1000.127, 125.129), {
    baseFee: 1000.13,
    discountAmount: 125.13,
    finalFee: 875
  });
  assert.throws(() => validateFee(100, 101), /Discount cannot exceed/);
  assert.throws(() => validateFee(Number.NaN, 0), /valid non-negative amounts/);
});
