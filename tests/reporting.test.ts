import { generateDataset } from "../data-generator/generator";
import { reconcileBatch } from "../matching-engine/classifier";
import { calculateAccuracyReport } from "../reporting/accuracyReport";
import { createExceptionReport } from "../reporting/exceptionReport";
import { createSummary } from "../reporting/summary";

describe("reporting", () => {
  test("reports actual reconciliation, accuracy, and throughput fields", () => {
    const dataset = generateDataset(100, 42);
    const results = reconcileBatch(dataset.merchantLedger, dataset.settlementReport);
    const accuracy = calculateAccuracyReport(results, dataset.groundTruth);
    const summary = createSummary(
      results,
      accuracy,
      {
        deterministic_processing_time_ms: 20,
        llm_time_ms: 5,
        total_processing_time_ms: 25
      },
      "RUN-TEST",
      "2026-08-31T00:00:00.000Z"
    );
    expect(summary).toMatchObject({
      total_records: 100,
      exact_matches: 70,
      fee_adjusted_matches: 12,
      possible_refunds: 6,
      missing_settlements: 4,
      duplicate_references: 4,
      delayed_settlements: 4,
      total_reconciled: 86,
      unresolved_exceptions: 14,
      overall_match_rate: 86,
      exception_rate: 14,
      false_matches: 0,
      false_exceptions: 0,
      classification_accuracy: 100,
      match_precision: 100,
      match_recall: 100,
      processing_time_ms: 20,
      records_per_second: 5_000
    });
    expect(accuracy.correct_classifications).toBe(100);
    expect(accuracy.per_category.POSSIBLE_REFUND).toMatchObject({
      support: 6,
      true_positives: 6,
      precision: 100,
      recall: 100
    });
  });

  test("counts false matches and false exceptions separately", () => {
    const dataset = generateDataset(100, 42);
    const results = reconcileBatch(dataset.merchantLedger, dataset.settlementReport);
    const missingTruth = results.find((result) => dataset.groundTruth[result.orderId].ground_truth === "NO_SETTLEMENT_FOUND")!;
    const exactTruth = results.find((result) => dataset.groundTruth[result.orderId].ground_truth === "EXACT_MATCH")!;
    const altered = results.map((result) => {
      if (result.orderId === missingTruth.orderId) return { ...result, status: "EXACT_MATCH" as const, reconciled: true };
      if (result.orderId === exactTruth.orderId) return { ...result, status: "NO_SETTLEMENT_FOUND" as const, reconciled: false };
      return result;
    });
    const accuracy = calculateAccuracyReport(altered, dataset.groundTruth);
    expect(accuracy.false_matches).toBe(1);
    expect(accuracy.false_exceptions).toBe(1);
    expect(accuracy.overall_classification_accuracy).toBe(98);
  });

  test("filters non-exact records by status and search", () => {
    const dataset = generateDataset(100, 42);
    const results = reconcileBatch(dataset.merchantLedger, dataset.settlementReport);
    expect(createExceptionReport(results)).toHaveLength(30);
    expect(createExceptionReport(results, { type: "POSSIBLE_REFUND" })).toHaveLength(6);
    const target = results.find((result) => result.status === "POSSIBLE_REFUND")!;
    expect(createExceptionReport(results, { search: target.orderId })).toHaveLength(1);
  });
});
