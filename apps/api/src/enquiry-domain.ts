export const ENQUIRY_STATUSES = [
  "new",
  "assigned",
  "contacted",
  "interested",
  "follow_up",
  "counselling",
  "demo_scheduled",
  "demo_completed",
  "admission_pending",
  "converted",
  "not_interested",
  "lost",
  "on_hold"
] as const;

export type EnquiryStatus = typeof ENQUIRY_STATUSES[number];

const STATUS_TRANSITIONS: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  new: ["assigned", "contacted", "interested", "follow_up", "on_hold", "not_interested", "lost"],
  assigned: ["contacted", "interested", "follow_up", "counselling", "demo_scheduled", "on_hold", "not_interested", "lost"],
  contacted: ["interested", "follow_up", "counselling", "demo_scheduled", "on_hold", "not_interested", "lost"],
  interested: ["follow_up", "counselling", "demo_scheduled", "admission_pending", "on_hold", "not_interested", "lost"],
  follow_up: ["contacted", "interested", "counselling", "demo_scheduled", "admission_pending", "on_hold", "not_interested", "lost"],
  counselling: ["follow_up", "demo_scheduled", "demo_completed", "admission_pending", "on_hold", "not_interested", "lost"],
  demo_scheduled: ["demo_completed", "follow_up", "admission_pending", "on_hold", "not_interested", "lost"],
  demo_completed: ["follow_up", "interested", "admission_pending", "on_hold", "not_interested", "lost"],
  admission_pending: ["follow_up", "converted", "on_hold", "not_interested", "lost"],
  converted: [],
  not_interested: ["follow_up"],
  lost: [],
  on_hold: ["contacted", "interested", "follow_up", "counselling", "demo_scheduled", "admission_pending", "not_interested", "lost"]
};

export function isEnquiryStatus(value: unknown): value is EnquiryStatus {
  return typeof value === "string" && (ENQUIRY_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: EnquiryStatus, to: EnquiryStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function validatePhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function normalizePersonName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

export function parsePositiveInteger(value: unknown, fallback: number, maximum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function validateFee(baseFee: number, discountAmount: number): { baseFee: number; discountAmount: number; finalFee: number } {
  if (!Number.isFinite(baseFee) || !Number.isFinite(discountAmount) || baseFee < 0 || discountAmount < 0) {
    throw new Error("Fee and discount must be valid non-negative amounts.");
  }
  if (discountAmount > baseFee) throw new Error("Discount cannot exceed the course fee.");
  const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
  const base = round(baseFee);
  const discount = round(discountAmount);
  return { baseFee: base, discountAmount: discount, finalFee: round(base - discount) };
}
