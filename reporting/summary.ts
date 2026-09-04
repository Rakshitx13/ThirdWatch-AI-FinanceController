import { AccuracyReport } from "./accuracyReport";
import { ReconciliationResult } from "../matching-engine/types";

export interface ProcessingMetrics {
  deterministic_processing_time_ms: number;
  llm_time_ms: number;
  total_processing_time_ms: number;
}

export interface ReconciliationSummary extends ProcessingMetrics {
  run_id: string;
  generated_at: string;
  total_records: number;
  exact_matches: number;
  fee_adjusted_matches: number;
  possible_refunds: number;
  missing_settlements: number;
  duplicate_references: number;
  delayed_settlements: number;
  total_reconciled: number;
  unresolved_exceptions: number;
  overall_match_rate: number;
  exception_rate: number;
  false_matches: number;
  false_exceptions: number;
  classification_accuracy: number;
  match_precision: number;
  match_recall: number;
  processing_time_ms: number;
  records_per_second: number;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : roundMetric((numerator / denominator) * 100);
}

export function createSummary(
  results: readonly ReconciliationResult[],
  accuracy: AccuracyReport,
  metrics: ProcessingMetrics,
  runId: string,
  generatedAt: string
): ReconciliationSummary {
  const count = (status: ReconciliationResult["status"]) =>
    results.filter((result) => result.status === status).length;
  const totalReconciled = results.filter((result) => result.reconciled).length;
  const deterministicSeconds = metrics.deterministic_processing_time_ms / 1_000;
  return {
    run_id: runId,
    generated_at: generatedAt,
    total_records: results.length,
    exact_matches: count("EXACT_MATCH"),
    fee_adjusted_matches: count("FEE_ADJUSTED_MATCH"),
    possible_refunds: count("POSSIBLE_REFUND"),
    missing_settlements: count("NO_SETTLEMENT_FOUND"),
    duplicate_references: count("DUPLICATE_REFERENCE"),
    delayed_settlements: count("DELAYED_SETTLEMENT"),
    total_reconciled: totalReconciled,
    unresolved_exceptions: results.length - totalReconciled,
    overall_match_rate: percentage(totalReconciled, results.length),
    exception_rate: percentage(results.length - totalReconciled, results.length),
    false_matches: accuracy.false_matches,
    false_exceptions: accuracy.false_exceptions,
    classification_accuracy: accuracy.overall_classification_accuracy,
    match_precision: accuracy.match_precision,
    match_recall: accuracy.match_recall,
    deterministic_processing_time_ms: roundMetric(metrics.deterministic_processing_time_ms),
    llm_time_ms: roundMetric(metrics.llm_time_ms),
    total_processing_time_ms: roundMetric(metrics.total_processing_time_ms),
    processing_time_ms: roundMetric(metrics.deterministic_processing_time_ms),
    records_per_second:
      deterministicSeconds === 0 ? 0 : roundMetric(results.length / deterministicSeconds)
  };
}
