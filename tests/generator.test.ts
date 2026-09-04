import {
  addWorkingDays,
  calculateExpectedSettlement,
  calculateFee,
  calculateGstOnFee,
  CARD_GST_EXEMPTION_LIMIT,
  FEE_RATE_RANGES,
  GST_RATE,
  roundMoney,
  toIsoDate
} from "../data-generator/businessRules";
import { serializeMerchantLedger, serializeSettlementReport } from "../data-generator/csv";
import { generateDataset, MINIMUM_BATCH_SIZE } from "../data-generator/generator";

describe("synthetic data generator", () => {
  test("rejects a batch smaller than 50 records", () => {
    expect(() => generateDataset(MINIMUM_BATCH_SIZE - 1, 42)).toThrow("at least 50");
  });

  test("generates 100 schema-complete records and one truth label per order", () => {
    const dataset = generateDataset(100, 42);
    expect(dataset.merchantLedger).toHaveLength(100);
    expect(Object.keys(dataset.groundTruth)).toHaveLength(100);
    expect(dataset.settlementReport).toHaveLength(96);

    const orderIds = new Set<string>();
    for (const order of dataset.merchantLedger) {
      expect(order).toEqual({
        order_id: expect.stringMatching(/^ORD\d+$/),
        amount: expect.any(Number),
        order_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        customer_name: expect.stringMatching(/^\S+ \S+$/),
        payment_mode: expect.stringMatching(/^(UPI|CARD|NETBANKING)$/)
      });
      expect(order.amount).toBeGreaterThan(0);
      expect(orderIds.has(order.order_id)).toBe(false);
      orderIds.add(order.order_id);
      expect(dataset.groundTruth[order.order_id]).toBeDefined();
    }

    const paymentIds = new Set(dataset.settlementReport.map((row) => row.payment_id));
    expect(paymentIds.size).toBe(dataset.settlementReport.length);
    for (const row of dataset.settlementReport) {
      expect(row.settled_amount).toBeGreaterThan(0);
      expect(row.fee_deducted).toBeGreaterThan(0);
      expect(row.gst_on_fee).toBeGreaterThanOrEqual(0);
      expect(row).not.toHaveProperty("ground_truth");
      expect(row).not.toHaveProperty("exception_type");
      expect(row).not.toHaveProperty("refund");
    }
  });

  test("is byte-for-byte deterministic for a supplied seed", () => {
    const first = generateDataset(100, 42);
    const second = generateDataset(100, 42);
    expect(second).toEqual(first);
    expect(serializeMerchantLedger(second.merchantLedger)).toBe(serializeMerchantLedger(first.merchantLedger));
    expect(serializeSettlementReport(second.settlementReport)).toBe(serializeSettlementReport(first.settlementReport));
    expect(generateDataset(100, 43)).not.toEqual(first);
  });

  test("uses the target approximate category distribution", () => {
    expect(generateDataset(100, 42).distribution).toEqual({
      EXACT_MATCH: 70,
      FEE_ADJUSTED_MATCH: 12,
      POSSIBLE_REFUND: 6,
      NO_SETTLEMENT_FOUND: 4,
      DUPLICATE_REFERENCE: 4,
      DELAYED_SETTLEMENT: 4
    });
    expect(Object.values(generateDataset(53, 42).distribution).reduce((a, b) => a + b, 0)).toBe(53);
  });

  test("places settlements exactly the declared number of working days later", () => {
    const dataset = generateDataset(100, 42);
    const orders = new Map(dataset.merchantLedger.map((order) => [order.order_id, order]));
    for (const settlement of dataset.settlementReport) {
      const truthOrderId = Object.entries(dataset.groundTruth).find(([, truth]) => truth.payment_id === settlement.payment_id)?.[0];
      expect(truthOrderId).toBeDefined();
      const truth = dataset.groundTruth[truthOrderId as string];
      const order = orders.get(truthOrderId as string);
      expect(order).toBeDefined();
      expect(settlement.settlement_date).toBe(
        toIsoDate(addWorkingDays(order!.order_date, truth.metadata.settlement_lag_working_days as number))
      );
      const weekday = new Date(settlement.settlement_date).getUTCDay();
      expect([0, 6]).not.toContain(weekday);
    }
  });

  test("calculates fees within each configured payment-mode band", () => {
    const dataset = generateDataset(100, 42);
    const orders = new Map(dataset.merchantLedger.map((order) => [order.order_id, order]));
    for (const settlement of dataset.settlementReport) {
      const orderId = Object.entries(dataset.groundTruth).find(([, truth]) => truth.payment_id === settlement.payment_id)![0];
      const order = orders.get(orderId)!;
      const range = FEE_RATE_RANGES[order.payment_mode];
      expect(settlement.fee_deducted).toBeGreaterThanOrEqual(roundMoney(order.amount * range.min));
      expect(settlement.fee_deducted).toBeLessThanOrEqual(roundMoney(order.amount * range.max));
    }
  });

  test("calculates GST and expected settlement consistently", () => {
    const dataset = generateDataset(100, 42);
    const orders = new Map(dataset.merchantLedger.map((order) => [order.order_id, order]));
    for (const settlement of dataset.settlementReport) {
      const [orderId, truth] = Object.entries(dataset.groundTruth).find(([, item]) => item.payment_id === settlement.payment_id)!;
      const order = orders.get(orderId)!;
      const expectedGst = order.payment_mode === "CARD" && order.amount <= CARD_GST_EXEMPTION_LIMIT
        ? 0
        : roundMoney(settlement.fee_deducted * GST_RATE);
      expect(settlement.gst_on_fee).toBe(expectedGst);
      expect(truth.expected_settlement).toBe(
        calculateExpectedSettlement(order.amount, settlement.fee_deducted, settlement.gst_on_fee)
      );
    }
  });

  test("applies the card <= ₹2,000 GST exception at its boundary", () => {
    const fee = calculateFee(2_000, 0.015);
    expect(calculateGstOnFee(fee, "CARD", 2_000)).toBe(0);
    expect(calculateGstOnFee(fee, "CARD", 2_000.01)).toBe(roundMoney(fee * GST_RATE));
    expect(calculateGstOnFee(fee, "UPI", 2_000)).toBe(roundMoney(fee * GST_RATE));
  });

  test("skips weekends when adding working days", () => {
    expect(toIsoDate(addWorkingDays("2026-08-07", 1))).toBe("2026-08-10");
    expect(toIsoDate(addWorkingDays("2026-08-07", 2))).toBe("2026-08-11");
    expect(toIsoDate(addWorkingDays("2026-08-08", 1))).toBe("2026-08-10");
    expect(() => addWorkingDays("invalid", 1)).toThrow("Invalid date");
    expect(() => addWorkingDays("2026-08-01", -1)).toThrow("non-negative integer");
  });

  test("creates actual repeated UTRs for every duplicate-reference truth label", () => {
    const dataset = generateDataset(100, 42);
    const utrCounts = new Map<string, number>();
    dataset.settlementReport.forEach((row) => utrCounts.set(row.utr, (utrCounts.get(row.utr) ?? 0) + 1));
    const duplicateTruth = Object.values(dataset.groundTruth).filter((truth) => truth.ground_truth === "DUPLICATE_REFERENCE");
    expect(duplicateTruth).toHaveLength(4);
    for (const truth of duplicateTruth) {
      expect(utrCounts.get(truth.metadata.duplicate_utr as string)).toBeGreaterThan(1);
    }
  });

  test("serializes the required CSV columns", () => {
    const dataset = generateDataset(50, 42);
    expect(serializeMerchantLedger(dataset.merchantLedger).split("\n")[0]).toBe(
      "order_id,amount,order_date,customer_name,payment_mode"
    );
    expect(serializeSettlementReport(dataset.settlementReport).split("\n")[0]).toBe(
      "payment_id,utr,settled_amount,settlement_date,fee_deducted,gst_on_fee,linked_order_id"
    );
  });
});
