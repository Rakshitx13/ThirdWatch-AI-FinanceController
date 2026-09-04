import { addWorkingDays, EXTENDED_MAX_SETTLEMENT_DAYS, toIsoDate } from "../data-generator/businessRules";
import { MerchantOrder } from "../data-generator/types";
import { SettlementCandidate } from "./types";

export function explainMissingSettlement(
  order: MerchantOrder,
  candidates: readonly SettlementCandidate[],
  expectedSettlement: number | null = null
): string {
  const searchStart = toIsoDate(addWorkingDays(order.order_date, 1));
  const searchEnd = toIsoDate(addWorkingDays(order.order_date, EXTENDED_MAX_SETTLEMENT_DAYS));
  const expectation = expectedSettlement === null
    ? "Expected settlement could not be calculated without a credible fee record."
    : `Expected settlement: ₹${expectedSettlement.toFixed(2)}.`;
  return `No settlement found for ${order.order_id}. Order amount: ₹${order.amount.toFixed(2)}. ${expectation} Searched settlement window: ${searchStart}–${searchEnd}. ${candidates.length} candidate row(s) considered; no unused candidate satisfied a deterministic rule.`;
}
