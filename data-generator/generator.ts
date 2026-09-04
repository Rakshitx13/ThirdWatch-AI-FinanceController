import {
  addWorkingDays,
  calculateExpectedSettlement,
  calculateFee,
  calculateGstOnFee,
  EXTENDED_MAX_SETTLEMENT_DAYS,
  FEE_RATE_RANGES,
  NORMAL_MAX_SETTLEMENT_DAYS,
  NORMAL_MIN_SETTLEMENT_DAYS,
  roundMoney,
  TARGET_DISTRIBUTION,
  toIsoDate
} from "./businessRules";
import { createSeededRandom, pick, randomInt, shuffle } from "./seed";
import {
  GeneratedDataset,
  GroundTruth,
  GroundTruthCategory,
  MerchantOrder,
  PaymentMode,
  SettlementRecord
} from "./types";

export const MINIMUM_BATCH_SIZE = 50;
export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_SEED = 42;

const AMOUNTS = [299, 499, 799, 999, 1299, 1599, 1999, 2499, 3499, 4999, 7499, 9999] as const;
const PAYMENT_MODES: readonly PaymentMode[] = ["UPI", "CARD", "NETBANKING"];
const FIRST_NAMES = ["Aarav", "Diya", "Ishaan", "Meera", "Vivaan", "Ananya", "Kabir", "Riya", "Arjun", "Saanvi", "Rohan", "Ira"] as const;
const LAST_NAMES = ["Sharma", "Mehta", "Patel", "Iyer", "Gupta", "Nair", "Kapoor", "Reddy", "Joshi", "Malhotra"] as const;
const CATEGORY_ORDER = Object.keys(TARGET_DISTRIBUTION) as GroundTruthCategory[];

function allocateCategories(size: number): Record<GroundTruthCategory, number> {
  const raw = CATEGORY_ORDER.map((category) => ({
    category,
    floor: Math.floor(size * TARGET_DISTRIBUTION[category]),
    remainder: size * TARGET_DISTRIBUTION[category] - Math.floor(size * TARGET_DISTRIBUTION[category])
  }));
  let unallocated = size - raw.reduce((sum, item) => sum + item.floor, 0);
  [...raw]
    .sort((a, b) => b.remainder - a.remainder || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .forEach((item) => {
      if (unallocated > 0) {
        item.floor += 1;
        unallocated -= 1;
      }
    });
  return Object.fromEntries(raw.map((item) => [item.category, item.floor])) as Record<GroundTruthCategory, number>;
}

function makeCategoryAssignments(size: number, random: () => number): GroundTruthCategory[] {
  const counts = allocateCategories(size);
  const categories = CATEGORY_ORDER.flatMap((category) => Array(counts[category]).fill(category));
  return shuffle(random, categories);
}

function makeReference(prefix: string, value: number, width: number): string {
  return `${prefix}${value.toString(36).toUpperCase().padStart(width, "0")}`;
}

function datePlusCalendarDays(date: string, days: number): string {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return toIsoDate(value);
}

export function generateDataset(size = DEFAULT_BATCH_SIZE, seed = DEFAULT_SEED): GeneratedDataset {
  if (!Number.isInteger(size) || size < MINIMUM_BATCH_SIZE) {
    throw new Error(`Batch size must be an integer of at least ${MINIMUM_BATCH_SIZE}.`);
  }
  if (!Number.isFinite(seed)) throw new Error("Seed must be a finite number.");

  const random = createSeededRandom(seed);
  const assignments = makeCategoryAssignments(size, random);
  const merchantLedger: MerchantOrder[] = [];
  const settlementReport: SettlementRecord[] = [];
  const groundTruth: GroundTruth = {};
  const duplicateIndexes = assignments
    .map((category, index) => (category === "DUPLICATE_REFERENCE" ? index : -1))
    .filter((index) => index >= 0);
  const duplicateUtrs = new Map<number, string>();
  for (let index = 0; index < duplicateIndexes.length; index += 2) {
    const utr = makeReference("UTR", seed * 10_000 + index / 2 + 900_000, 9);
    duplicateUtrs.set(duplicateIndexes[index], utr);
    if (duplicateIndexes[index + 1] !== undefined) {
      duplicateUtrs.set(duplicateIndexes[index + 1], utr);
    } else if (index > 0) {
      // An odd final duplicate joins the preceding duplicate group so every label is evidence-backed.
      duplicateUtrs.set(duplicateIndexes[index], duplicateUtrs.get(duplicateIndexes[index - 1]) as string);
    }
  }

  assignments.forEach((category, index) => {
    const orderId = `ORD${(1001 + index).toString()}`;
    const amount = pick(random, AMOUNTS);
    const paymentMode = pick(random, PAYMENT_MODES);
    const orderDate = datePlusCalendarDays("2026-08-01", randomInt(random, 0, 20));
    const order: MerchantOrder = {
      order_id: orderId,
      amount,
      order_date: orderDate,
      customer_name: `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`,
      payment_mode: paymentMode
    };
    merchantLedger.push(order);

    const feeRange = FEE_RATE_RANGES[paymentMode];
    const feeRate = feeRange.min + random() * (feeRange.max - feeRange.min);
    const fee = calculateFee(amount, feeRate);
    const gst = calculateGstOnFee(fee, paymentMode, amount);
    const expectedSettlement = calculateExpectedSettlement(amount, fee, gst);

    if (category === "NO_SETTLEMENT_FOUND") {
      groundTruth[orderId] = {
        ground_truth: category,
        expected_settlement: expectedSettlement,
        payment_id: null,
        metadata: { settlement_lag_working_days: null }
      };
      return;
    }

    const lag = category === "DELAYED_SETTLEMENT"
      ? randomInt(random, NORMAL_MAX_SETTLEMENT_DAYS + 1, EXTENDED_MAX_SETTLEMENT_DAYS)
      : randomInt(random, NORMAL_MIN_SETTLEMENT_DAYS, NORMAL_MAX_SETTLEMENT_DAYS);
    let settledAmount = expectedSettlement;
    const metadata: GroundTruth[typeof orderId]["metadata"] = {
      settlement_lag_working_days: lag
    };
    if (category === "FEE_ADJUSTED_MATCH") {
      const adjustment = roundMoney(1.01 + random() * 3.99) * (index % 2 === 0 ? 1 : -1);
      settledAmount = roundMoney(expectedSettlement + adjustment);
      metadata.adjustment_amount = roundMoney(adjustment);
    } else if (category === "POSSIBLE_REFUND") {
      const maximumShortfallUnits = Math.max(5, Math.floor(Math.min(500, expectedSettlement - 10) / 10));
      const shortfall = randomInt(random, 5, maximumShortfallUnits) * 10;
      settledAmount = roundMoney(expectedSettlement - shortfall);
      metadata.refund_shortfall = shortfall;
    }

    const paymentId = makeReference("pay_", seed * 1000 + index + 100_000, 7);
    const utr = duplicateUtrs.get(index) ?? makeReference("UTR", seed * 100_000 + index + 10_000_000, 10);
    if (category === "DUPLICATE_REFERENCE") metadata.duplicate_utr = utr;
    settlementReport.push({
      payment_id: paymentId,
      utr,
      settled_amount: settledAmount,
      settlement_date: toIsoDate(addWorkingDays(orderDate, lag)),
      fee_deducted: fee,
      gst_on_fee: gst,
      linked_order_id: random() < 0.08 ? "" : orderId
    });
    groundTruth[orderId] = {
      ground_truth: category,
      expected_settlement: expectedSettlement,
      payment_id: paymentId,
      metadata
    };
  });

  const distribution = CATEGORY_ORDER.reduce((counts, category) => {
    counts[category] = assignments.filter((value) => value === category).length;
    return counts;
  }, {} as Record<GroundTruthCategory, number>);

  return {
    seed,
    merchantLedger,
    settlementReport: shuffle(random, settlementReport),
    groundTruth,
    distribution
  };
}
