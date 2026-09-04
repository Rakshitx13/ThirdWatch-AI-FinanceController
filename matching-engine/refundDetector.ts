import {
  EXTENDED_MAX_SETTLEMENT_DAYS,
  FEE_ADJUSTED_TOLERANCE,
  NORMAL_MIN_SETTLEMENT_DAYS
} from "../data-generator/businessRules";
import { RuleEvaluation, SettlementCandidate } from "./types";

export function evaluatePossibleRefund(
  candidate: SettlementCandidate,
  hasDuplicateReference = false
): RuleEvaluation {
  const shortfall = -candidate.amountDifference;
  const validDate =
    candidate.settlementLagWorkingDays >= NORMAL_MIN_SETTLEMENT_DAYS &&
    candidate.settlementLagWorkingDays <= EXTENDED_MAX_SETTLEMENT_DAYS;
  const hasExactLink = candidate.signals.includes("LINKED_ORDER_ID_EXACT");
  const hasUnlinkedFinancialProfile =
    candidate.settlement.linked_order_id === "" &&
    candidate.signals.includes("FEE_AND_GST_PROFILE_VALID");
  const matched =
    !hasDuplicateReference &&
    !candidate.signals.includes("LINKED_ORDER_ID_CONFLICT") &&
    validDate &&
    shortfall > FEE_ADJUSTED_TOLERANCE &&
    (hasExactLink || hasUnlinkedFinancialProfile);

  return {
    matched,
    rule: "POSSIBLE_REFUND",
    reason: hasDuplicateReference
      ? `UTR ${candidate.settlement.utr} has a duplicate-reference conflict.`
      : `Possible refund / unexplained settlement shortfall: expected ₹${candidate.expectedSettlement.toFixed(2)}, actual ₹${candidate.settlement.settled_amount.toFixed(2)}, shortfall ₹${Math.max(0, shortfall).toFixed(2)}.`
  };
}
