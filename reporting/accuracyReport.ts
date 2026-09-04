import { GroundTruth, GroundTruthCategory } from "../data-generator/types";
import { ReconciliationResult, ReconciliationStatus } from "../matching-engine/types";

const STATUSES: ReconciliationStatus[] = [
  "EXACT_MATCH",
  "FEE_ADJUSTED_MATCH",
  "POSSIBLE_REFUND",
  "NO_SETTLEMENT_FOUND",
  "DUPLICATE_REFERENCE",
  "DELAYED_SETTLEMENT"
];
const RECONCILED_STATUSES = new Set<GroundTruthCategory>([
  "EXACT_MATCH",
  "FEE_ADJUSTED_MATCH",
  "DELAYED_SETTLEMENT"
]);

export interface CategoryAccuracy {
  support: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number;
  recall: number;
}

export interface AccuracyReport {
  total_records: number;
  correct_classifications: number;
  overall_classification_accuracy: number;
  match_precision: number;
  match_recall: number;
  true_positive_matches: number;
  true_negative_exceptions: number;
  false_matches: number;
  false_exceptions: number;
  per_category: Record<ReconciliationStatus, CategoryAccuracy>;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 100;
}

export function calculateAccuracyReport(
  results: readonly ReconciliationResult[],
  groundTruth: GroundTruth
): AccuracyReport {
  let correct = 0;
  let truePositiveMatches = 0;
  let trueNegativeExceptions = 0;
  let falseMatches = 0;
  let falseExceptions = 0;

  for (const result of results) {
    const truth = groundTruth[result.orderId];
    if (!truth) throw new Error(`Ground truth is missing order ${result.orderId}.`);
    if (result.status === truth.ground_truth) correct += 1;
    const truthReconciled = RECONCILED_STATUSES.has(truth.ground_truth);
    if (result.reconciled && truthReconciled) truePositiveMatches += 1;
    else if (!result.reconciled && !truthReconciled) trueNegativeExceptions += 1;
    else if (result.reconciled && !truthReconciled) falseMatches += 1;
    else falseExceptions += 1;
  }

  const perCategory = Object.fromEntries(
    STATUSES.map((status) => {
      let support = 0;
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;
      for (const result of results) {
        const truthStatus = groundTruth[result.orderId].ground_truth;
        if (truthStatus === status) support += 1;
        if (result.status === status && truthStatus === status) truePositives += 1;
        else if (result.status === status) falsePositives += 1;
        else if (truthStatus === status) falseNegatives += 1;
      }
      return [
        status,
        {
          support,
          true_positives: truePositives,
          false_positives: falsePositives,
          false_negatives: falseNegatives,
          precision: percentage(truePositives, truePositives + falsePositives),
          recall: percentage(truePositives, truePositives + falseNegatives)
        }
      ];
    })
  ) as Record<ReconciliationStatus, CategoryAccuracy>;

  return {
    total_records: results.length,
    correct_classifications: correct,
    overall_classification_accuracy: percentage(correct, results.length),
    match_precision: percentage(truePositiveMatches, truePositiveMatches + falseMatches),
    match_recall: percentage(truePositiveMatches, truePositiveMatches + falseExceptions),
    true_positive_matches: truePositiveMatches,
    true_negative_exceptions: trueNegativeExceptions,
    false_matches: falseMatches,
    false_exceptions: falseExceptions,
    per_category: perCategory
  };
}
