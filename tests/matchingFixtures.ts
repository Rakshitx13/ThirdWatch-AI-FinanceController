import { addWorkingDays, roundMoney, toIsoDate } from "../data-generator/businessRules";
import { MerchantOrder, SettlementRecord } from "../data-generator/types";
import { scoreCandidate } from "../matching-engine/candidateMatcher";
import { SettlementCandidate } from "../matching-engine/types";

export const baseOrder: MerchantOrder = {
  order_id: "ORD_TEST",
  amount: 1_000,
  order_date: "2026-08-03",
  customer_name: "Aarav Sharma",
  payment_mode: "UPI"
};

export function makeCandidate(
  amountDifference: number,
  lagWorkingDays = 2,
  overrides: Partial<SettlementRecord> = {}
): SettlementCandidate {
  const expectedSettlement = 988.2;
  const settlement: SettlementRecord = {
    payment_id: "pay_TEST",
    utr: "UTR_TEST",
    settled_amount: roundMoney(expectedSettlement + amountDifference),
    settlement_date: toIsoDate(addWorkingDays(baseOrder.order_date, lagWorkingDays)),
    fee_deducted: 10,
    gst_on_fee: 1.8,
    linked_order_id: baseOrder.order_id,
    ...overrides
  };
  return scoreCandidate(baseOrder, settlement);
}
