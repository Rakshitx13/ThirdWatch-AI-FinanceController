import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createAnthropicExplanationClient } from "../ai/anthropicClient";
import { explainAmbiguity } from "../ai/explainAmbiguity";
import { ExplanationClient, LlmExplanationResult } from "../ai/types";
import { AuditEntry, createAuditEntry, writeAuditTrail, writeJsonAtomically } from "../audit/auditWriter";
import { parseMerchantLedger, parseSettlementReport } from "../data-generator/csv";
import { GroundTruth, MerchantOrder, SettlementRecord } from "../data-generator/types";
import { discoverCandidates } from "../matching-engine/candidateMatcher";
import { reconcileBatch } from "../matching-engine/classifier";
import { ReconciliationResult } from "../matching-engine/types";
import { AccuracyReport, calculateAccuracyReport } from "./accuracyReport";
import { createExceptionReport } from "./exceptionReport";
import { ProcessingMetrics, ReconciliationSummary, createSummary } from "./summary";

export type PersistedReconciliationResult = ReconciliationResult &
  LlmExplanationResult & {
    order: MerchantOrder;
    selectedSettlement: SettlementRecord | null;
    candidateSettlements: SettlementRecord[];
  };

export interface PipelineOutput {
  results: PersistedReconciliationResult[];
  auditTrail: AuditEntry[];
  summary: ReconciliationSummary;
  accuracy: AccuracyReport;
}

export interface PipelineOptions {
  dataDirectory?: string;
  explanationClient?: ExplanationClient | null;
  runId?: string;
  now?: () => Date;
}

function roundTiming(value: number): number {
  return Math.round(value * 100) / 100;
}

async function readGroundTruth(filePath: string): Promise<GroundTruth> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Ground truth must contain a JSON object keyed by order ID.");
  }
  return parsed as GroundTruth;
}

export async function runReconciliationPipeline(options: PipelineOptions = {}): Promise<PipelineOutput> {
  const dataDirectory = path.resolve(options.dataDirectory ?? path.join(process.cwd(), "data"));
  const [ledgerCsv, settlementCsv, groundTruth] = await Promise.all([
    readFile(path.join(dataDirectory, "merchant_ledger.csv"), "utf8"),
    readFile(path.join(dataDirectory, "settlement_report.csv"), "utf8"),
    readGroundTruth(path.join(dataDirectory, "ground_truth.json"))
  ]);
  const orders = parseMerchantLedger(ledgerCsv);
  const settlements = parseSettlementReport(settlementCsv);
  if (orders.length === 0) throw new Error("Merchant ledger is empty.");

  const deterministicStarted = performance.now();
  const deterministicResults = reconcileBatch(orders, settlements);
  const deterministicProcessingTime = performance.now() - deterministicStarted;

  const client = options.explanationClient === undefined
    ? createAnthropicExplanationClient().client
    : options.explanationClient;
  const ordersById = new Map(orders.map((order) => [order.order_id, order]));
  const llmStarted = performance.now();
  const llmResults = await Promise.all(
    deterministicResults.map((result) => {
      const order = ordersById.get(result.orderId);
      if (!order) throw new Error(`Order ${result.orderId} disappeared during processing.`);
      const needsEvidence =
        client !== null &&
        (result.status === "POSSIBLE_REFUND" ||
          result.status === "DUPLICATE_REFERENCE" ||
          (result.status === "NO_SETTLEMENT_FOUND" && result.candidateIds.length > 1));
      return explainAmbiguity(
        { order, result, candidates: needsEvidence ? discoverCandidates(order, settlements) : [] },
        client
      );
    })
  );
  const llmWallTime = performance.now() - llmStarted;
  const llmWasAttempted = llmResults.some(
    (result) =>
      result.llm_status === "AVAILABLE" ||
      (result.llm_status === "UNAVAILABLE" && result.llm_error_code !== "MISSING_CONFIGURATION")
  );
  const llmTime = llmWasAttempted ? llmWallTime : 0;
  const totalProcessingTime = deterministicProcessingTime + llmTime;
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const runId = options.runId ?? `RUN-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const settlementsById = new Map(
    settlements.map((settlement) => [settlement.payment_id, settlement])
  );
  const results: PersistedReconciliationResult[] = deterministicResults.map((result, index) => {
    const order = ordersById.get(result.orderId);
    if (!order) throw new Error(`Order ${result.orderId} disappeared during result persistence.`);
    return {
      ...result,
      ...llmResults[index],
      order,
      selectedSettlement: result.selectedPaymentId
        ? settlementsById.get(result.selectedPaymentId) ?? null
        : null,
      candidateSettlements: result.candidateIds
        .map((paymentId) => settlementsById.get(paymentId))
        .filter((settlement): settlement is SettlementRecord => settlement !== undefined)
    };
  });
  const accuracy = calculateAccuracyReport(deterministicResults, groundTruth);
  const metrics: ProcessingMetrics = {
    deterministic_processing_time_ms: roundTiming(deterministicProcessingTime),
    llm_time_ms: roundTiming(llmTime),
    total_processing_time_ms: roundTiming(totalProcessingTime)
  };
  const summary = createSummary(deterministicResults, accuracy, metrics, runId, generatedAt);
  const auditTrail = deterministicResults.map((result, index) =>
    createAuditEntry(result, llmResults[index], generatedAt)
  );

  await Promise.all([
    writeJsonAtomically(path.join(dataDirectory, "reconciliation_result.json"), results),
    writeAuditTrail(path.join(dataDirectory, "audit_trail.json"), auditTrail),
    writeJsonAtomically(path.join(dataDirectory, "summary.json"), summary),
    writeJsonAtomically(path.join(dataDirectory, "accuracy_report.json"), accuracy),
    writeJsonAtomically(path.join(dataDirectory, "exception_report.json"), createExceptionReport(deterministicResults))
  ]);
  return { results, auditTrail, summary, accuracy };
}

async function main(): Promise<void> {
  const output = await runReconciliationPipeline();
  console.log(JSON.stringify(output.summary, null, 2));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
