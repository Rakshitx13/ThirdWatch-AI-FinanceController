import { generateDataset } from "../data-generator/generator";
import { reconcileBatch } from "../matching-engine/classifier";

describe("deterministic batch classifier", () => {
  test("classifies every order exactly once without settlement reuse", () => {
    const dataset = generateDataset(100, 42);
    const results = reconcileBatch(dataset.merchantLedger, dataset.settlementReport);
    expect(results).toHaveLength(dataset.merchantLedger.length);
    expect(new Set(results.map((result) => result.orderId)).size).toBe(dataset.merchantLedger.length);

    const selectedPaymentIds = results
      .map((result) => result.selectedPaymentId)
      .filter((paymentId): paymentId is string => paymentId !== null);
    expect(new Set(selectedPaymentIds).size).toBe(selectedPaymentIds.length);
  });

  test("matches the hidden validation labels without reading them during classification", () => {
    const dataset = generateDataset(100, 42);
    const results = reconcileBatch(dataset.merchantLedger, dataset.settlementReport);
    const mismatches = results.filter(
      (result) => result.status !== dataset.groundTruth[result.orderId].ground_truth
    );
    expect(mismatches).toEqual([]);
    expect(results.reduce<Record<string, number>>((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      return counts;
    }, {})).toEqual({
      DELAYED_SETTLEMENT: 4,
      EXACT_MATCH: 70,
      DUPLICATE_REFERENCE: 4,
      FEE_ADJUSTED_MATCH: 12,
      POSSIBLE_REFUND: 6,
      NO_SETTLEMENT_FOUND: 4
    });
  });

  test("sets reconciled true only for exact, fee-adjusted, and delayed records", () => {
    const dataset = generateDataset(100, 42);
    const results = reconcileBatch(dataset.merchantLedger, dataset.settlementReport);
    for (const result of results) {
      expect(result.reconciled).toBe(
        ["EXACT_MATCH", "FEE_ADJUSTED_MATCH", "DELAYED_SETTLEMENT"].includes(result.status)
      );
    }
  });

  test("is deterministic and handles an empty batch", () => {
    const dataset = generateDataset(50, 7);
    expect(reconcileBatch(dataset.merchantLedger, dataset.settlementReport)).toEqual(
      reconcileBatch(dataset.merchantLedger, dataset.settlementReport)
    );
    expect(reconcileBatch([], [])).toEqual([]);
  });
});
