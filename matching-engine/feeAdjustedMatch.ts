import {
  EXACT_AMOUNT_TOLERANCE,
  FEE_ADJUSTED_TOLERANCE,
  NORMAL_MAX_SETTLEMENT_DAYS,
  NORMAL_MIN_SETTLEMENT_DAYS
} from "../data-generator/businessRules";
import { RuleEvaluation, SettlementCandidate } from "./types";

export function evaluateFeeAdjustedMatch(
  candidate: SettlementCandidate,
  hasDuplicateReference = false
): RuleEvaluation {
  const difference = Math.abs(candidate.amountDifference);
  const normalDate =
    candidate.settlementLagWorkingDays >= NORMAL_MIN_SETTLEMENT_DAYS &&
    candidate.settlementLagWorkingDays <= NORMAL_MAX_SETTLEMENT_DAYS;
  const matched =
    !hasDuplicateReference &&
    difference > EXACT_AMOUNT_TOLERANCE &&
    difference <= FEE_ADJUSTED_TOLERANCE &&
    normalDate;
  return {
    matched,
    rule: "FEE_ADJUSTED_MATCH",
    reason: hasDuplicateReference
      ? `UTR ${candidate.settlement.utr} has a duplicate-reference conflict.`
      : `Expected ₹${candidate.expectedSettlement.toFixed(2)}, actual ₹${candidate.settlement.settled_amount.toFixed(2)}, wider-tolerance difference ₹${difference.toFixed(2)}.`
  };
}
