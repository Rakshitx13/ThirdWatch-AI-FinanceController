import {
  EXACT_AMOUNT_TOLERANCE,
  NORMAL_MAX_SETTLEMENT_DAYS,
  NORMAL_MIN_SETTLEMENT_DAYS
} from "../data-generator/businessRules";
import { RuleEvaluation, SettlementCandidate } from "./types";

export function evaluateExactMatch(
  candidate: SettlementCandidate,
  hasDuplicateReference = false
): RuleEvaluation {
  const difference = Math.abs(candidate.amountDifference);
  const normalDate =
    candidate.settlementLagWorkingDays >= NORMAL_MIN_SETTLEMENT_DAYS &&
    candidate.settlementLagWorkingDays <= NORMAL_MAX_SETTLEMENT_DAYS;
  const matched = !hasDuplicateReference && difference <= EXACT_AMOUNT_TOLERANCE && normalDate;
  return {
    matched,
    rule: "EXACT_MATCH",
    reason: hasDuplicateReference
      ? `UTR ${candidate.settlement.utr} has a duplicate-reference conflict.`
      : `Expected ₹${candidate.expectedSettlement.toFixed(2)}, actual ₹${candidate.settlement.settled_amount.toFixed(2)}, difference ₹${difference.toFixed(2)}, lag ${candidate.settlementLagWorkingDays} working day(s).`
  };
}
