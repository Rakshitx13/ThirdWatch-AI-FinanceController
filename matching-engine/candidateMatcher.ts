import {
  calculateExpectedSettlement,
  calculateGstOnFee,
  EXACT_AMOUNT_TOLERANCE,
  EXTENDED_MAX_SETTLEMENT_DAYS,
  FEE_ADJUSTED_TOLERANCE,
  FEE_RATE_RANGES,
  NORMAL_MAX_SETTLEMENT_DAYS,
  NORMAL_MIN_SETTLEMENT_DAYS,
  roundMoney,
  workingDaysBetween
} from "../data-generator/businessRules";
import { MerchantOrder, SettlementRecord } from "../data-generator/types";
import { CandidateSignal, SettlementCandidate } from "./types";

/** A direct order reference is the strongest candidate relationship. */
export const LINKED_ORDER_ID_SCORE = 50;
/** A row explicitly linked elsewhere is contradictory evidence; a blank link is neutral. */
export const LINKED_ORDER_ID_CONFLICT_PENALTY = 30;
/** An exact post-fee amount is strong independent financial evidence. */
export const EXACT_AMOUNT_SCORE = 25;
/** Up to ₹1 drift remains strong amount evidence. */
export const EXACT_TOLERANCE_AMOUNT_SCORE = 20;
/** ₹1–₹5 drift is useful but intentionally weaker evidence. */
export const WIDE_TOLERANCE_AMOUNT_SCORE = 10;
/** A settlement inside the normal one-to-two-working-day window is meaningful evidence. */
export const NORMAL_DATE_SCORE = 15;
/** A settlement in the three-to-five-day window is weak date evidence. */
export const EXTENDED_DATE_SCORE = 5;
/** A valid fee band and GST profile supports candidates even when a shortfall exists. */
export const VALID_FEE_PROFILE_SCORE = 10;
/** Candidates below this score are too weak to use for deterministic classification. */
export const MINIMUM_CANDIDATE_SCORE = 20;

function hasValidFeeProfile(order: MerchantOrder, settlement: SettlementRecord): boolean {
  const feeRange = FEE_RATE_RANGES[order.payment_mode];
  const minimumFee = roundMoney(order.amount * feeRange.min);
  const maximumFee = roundMoney(order.amount * feeRange.max);
  return (
    settlement.fee_deducted >= minimumFee &&
    settlement.fee_deducted <= maximumFee &&
    settlement.gst_on_fee === calculateGstOnFee(settlement.fee_deducted, order.payment_mode, order.amount)
  );
}

export function scoreCandidate(order: MerchantOrder, settlement: SettlementRecord): SettlementCandidate {
  const expectedSettlement = calculateExpectedSettlement(
    order.amount,
    settlement.fee_deducted,
    settlement.gst_on_fee
  );
  const amountDifference = roundMoney(settlement.settled_amount - expectedSettlement);
  const absoluteDifference = Math.abs(amountDifference);
  const settlementLagWorkingDays = workingDaysBetween(order.order_date, settlement.settlement_date);
  const signals: CandidateSignal[] = [];
  let score = 0;

  if (settlement.linked_order_id === order.order_id) {
    score += LINKED_ORDER_ID_SCORE;
    signals.push("LINKED_ORDER_ID_EXACT");
  } else if (settlement.linked_order_id !== "") {
    score -= LINKED_ORDER_ID_CONFLICT_PENALTY;
    signals.push("LINKED_ORDER_ID_CONFLICT");
  }
  if (absoluteDifference === 0) {
    score += EXACT_AMOUNT_SCORE;
    signals.push("SETTLEMENT_AMOUNT_EXACT");
  } else if (absoluteDifference <= EXACT_AMOUNT_TOLERANCE) {
    score += EXACT_TOLERANCE_AMOUNT_SCORE;
    signals.push("SETTLEMENT_AMOUNT_WITHIN_EXACT_TOLERANCE");
  } else if (absoluteDifference <= FEE_ADJUSTED_TOLERANCE) {
    score += WIDE_TOLERANCE_AMOUNT_SCORE;
    signals.push("SETTLEMENT_AMOUNT_WITHIN_WIDE_TOLERANCE");
  }
  if (
    settlementLagWorkingDays >= NORMAL_MIN_SETTLEMENT_DAYS &&
    settlementLagWorkingDays <= NORMAL_MAX_SETTLEMENT_DAYS
  ) {
    score += NORMAL_DATE_SCORE;
    signals.push("NORMAL_SETTLEMENT_WINDOW");
  } else if (
    settlementLagWorkingDays > NORMAL_MAX_SETTLEMENT_DAYS &&
    settlementLagWorkingDays <= EXTENDED_MAX_SETTLEMENT_DAYS
  ) {
    score += EXTENDED_DATE_SCORE;
    signals.push("EXTENDED_SETTLEMENT_WINDOW");
  }
  if (hasValidFeeProfile(order, settlement)) {
    score += VALID_FEE_PROFILE_SCORE;
    signals.push("FEE_AND_GST_PROFILE_VALID");
  }

  return {
    order,
    settlement,
    score,
    signals,
    expectedSettlement,
    amountDifference,
    settlementLagWorkingDays
  };
}

export function discoverCandidates(
  order: MerchantOrder,
  settlements: readonly SettlementRecord[]
): SettlementCandidate[] {
  return settlements
    .map((settlement) => scoreCandidate(order, settlement))
    .filter((candidate) => candidate.score >= MINIMUM_CANDIDATE_SCORE)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Math.abs(left.amountDifference) - Math.abs(right.amountDifference) ||
        left.settlement.payment_id.localeCompare(right.settlement.payment_id)
    );
}
