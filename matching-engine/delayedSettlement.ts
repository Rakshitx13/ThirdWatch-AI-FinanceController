import {
  EXACT_AMOUNT_TOLERANCE,
  EXTENDED_MAX_SETTLEMENT_DAYS,
  NORMAL_MAX_SETTLEMENT_DAYS
} from "../data-generator/businessRules";
import { RuleEvaluation, SettlementCandidate } from "./types";

export function evaluateDelayedSettlement(
  candidate: SettlementCandidate,
  hasDuplicateReference = false
): RuleEvaluation {
  const difference = Math.abs(candidate.amountDifference);
  const delayed =
    candidate.settlementLagWorkingDays > NORMAL_MAX_SETTLEMENT_DAYS &&
    candidate.settlementLagWorkingDays <= EXTENDED_MAX_SETTLEMENT_DAYS;
  const matched = !hasDuplicateReference && difference <= EXACT_AMOUNT_TOLERANCE && delayed;
  return {
    matched,
    rule: "DELAYED_SETTLEMENT",
    reason: hasDuplicateReference
      ? `UTR ${candidate.settlement.utr} has a duplicate-reference conflict.`
      : `Financial amount reconciles within ₹${EXACT_AMOUNT_TOLERANCE.toFixed(2)}, but settlement arrived after ${candidate.settlementLagWorkingDays} working days.`
  };
}
