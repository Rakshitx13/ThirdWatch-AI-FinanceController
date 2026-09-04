import { addWorkingDays, calculateExpectedSettlement, calculateGstOnFee, toIsoDate } from "../data-generator/businessRules";
import { MerchantOrder, SettlementRecord } from "../data-generator/types";
import { reconcileBatch } from "../matching-engine/classifier";
import { findDuplicateUtrs } from "../matching-engine/duplicateReference";

function settlementFor(order: MerchantOrder, paymentId: string, utr: string): SettlementRecord {
  const fee = order.amount * 0.01;
  const gst = calculateGstOnFee(fee, order.payment_mode, order.amount);
  return {
    payment_id: paymentId,
    utr,
    settled_amount: calculateExpectedSettlement(order.amount, fee, gst),
    settlement_date: toIsoDate(addWorkingDays(order.order_date, 1)),
    fee_deducted: fee,
    gst_on_fee: gst,
    linked_order_id: order.order_id
  };
}

describe("duplicate UTR detection", () => {
  const orders: MerchantOrder[] = [
    { order_id: "ORD_A", amount: 1_000, order_date: "2026-08-03", customer_name: "Aarav Sharma", payment_mode: "UPI" },
    { order_id: "ORD_B", amount: 2_000, order_date: "2026-08-03", customer_name: "Diya Mehta", payment_mode: "UPI" }
  ];
  const settlements = [
    settlementFor(orders[0], "pay_A", "UTR_SHARED"),
    settlementFor(orders[1], "pay_B", "UTR_SHARED")
  ];

  test("reports the repeated UTR and every associated order", () => {
    expect(findDuplicateUtrs(orders, settlements)).toEqual([
      { utr: "UTR_SHARED", settlements, orderIds: ["ORD_A", "ORD_B"] }
    ]);
  });

  test("duplicate-reference precedence prevents otherwise exact matches", () => {
    const results = reconcileBatch(orders, settlements);
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.status)).toEqual([
      "DUPLICATE_REFERENCE",
      "DUPLICATE_REFERENCE"
    ]);
    results.forEach((result) => {
      expect(result.reconciled).toBe(false);
      expect(result.selectedPaymentId).toBeNull();
      expect(result.reason).toContain("ORD_A, ORD_B");
    });
  });
});
