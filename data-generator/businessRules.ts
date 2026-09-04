import { PaymentMode } from "./types";

/** GST charged on transaction fees under the demo's Indian tax rule. */
export const GST_RATE = 0.18;

/** Strict reconciliation accepts at most one rupee of rounding drift. */
export const EXACT_AMOUNT_TOLERANCE = 1;

/** Wider reconciliation accepts at most five rupees of settlement drift. */
export const FEE_ADJUSTED_TOLERANCE = 5;

/** Gateway settlement cannot normally occur on the order date. */
export const NORMAL_MIN_SETTLEMENT_DAYS = 1;

/** One or two working days is the normal settlement window. */
export const NORMAL_MAX_SETTLEMENT_DAYS = 2;

/** Up to five working days is treated as delayed rather than missing. */
export const EXTENDED_MAX_SETTLEMENT_DAYS = 5;

/** Card transactions at or below this amount are exempt from GST on the fee. */
export const CARD_GST_EXEMPTION_LIMIT = 2_000;

/** Mode-specific fee bands used to synthesize realistic gateway charges. */
export const FEE_RATE_RANGES: Record<PaymentMode, { min: number; max: number }> = {
  UPI: { min: 0.0025, max: 0.01 },
  CARD: { min: 0.01, max: 0.02 },
  NETBANKING: { min: 0.005, max: 0.015 }
};

/** Target category proportions; integer batches use a largest-remainder allocation. */
export const TARGET_DISTRIBUTION = {
  EXACT_MATCH: 0.7,
  FEE_ADJUSTED_MATCH: 0.12,
  POSSIBLE_REFUND: 0.06,
  NO_SETTLEMENT_FOUND: 0.04,
  DUPLICATE_REFERENCE: 0.04,
  DELAYED_SETTLEMENT: 0.04
} as const;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFee(amount: number, feeRate: number): number {
  return roundMoney(amount * feeRate);
}

export function calculateGstOnFee(
  fee: number,
  paymentMode: PaymentMode,
  amount: number
): number {
  if (paymentMode === "CARD" && amount <= CARD_GST_EXEMPTION_LIMIT) {
    return 0;
  }
  return roundMoney(fee * GST_RATE);
}

export function calculateExpectedSettlement(
  amount: number,
  fee: number,
  gstOnFee: number
): number {
  return roundMoney(amount - fee - gstOnFee);
}

/** Adds working days while skipping Saturdays and Sundays. */
export function addWorkingDays(date: string | Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("Working-day offset must be a non-negative integer.");
  }
  const result = new Date(date);
  if (Number.isNaN(result.getTime())) {
    throw new Error("Invalid date supplied to addWorkingDays.");
  }
  result.setUTCHours(0, 0, 0, 0);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result;
}

/** Counts working days after the start date through the end date. */
export function workingDaysBetween(start: string | Date, end: string | Date): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid date supplied to workingDaysBetween.");
  }
  startDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(0, 0, 0, 0);
  if (endDate < startDate) return -workingDaysBetween(endDate, startDate);

  let workingDays = 0;
  const cursor = new Date(startDate);
  while (cursor < endDate) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) workingDays += 1;
  }
  return workingDays;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
