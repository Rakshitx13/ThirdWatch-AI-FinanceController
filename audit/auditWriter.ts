import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { LlmExplanationResult } from "../ai/types";
import { ReconciliationResult } from "../matching-engine/types";

export interface AuditEntry {
  order_id: string;
  timestamp: string;
  candidate_ids: string[];
  selected_payment_id: string | null;
  selected_utr: string | null;
  expected_settlement: number | null;
  actual_settlement: number | null;
  amount_difference: number | null;
  unexplained_shortfall: number | null;
  settlement_lag_days: number | null;
  rules_evaluated: string[];
  rule_fired: string;
  classification: string;
  reconciled: boolean;
  confidence: string;
  reason: string;
  llm_consulted: boolean;
  llm_status: LlmExplanationResult["llm_status"];
  llm_error_code: LlmExplanationResult["llm_error_code"];
  llm_explanation: string | null;
  llm_time_ms: number;
}

export function createAuditEntry(
  result: ReconciliationResult,
  llm: LlmExplanationResult,
  timestamp: string
): AuditEntry {
  return {
    order_id: result.orderId,
    timestamp,
    candidate_ids: [...result.candidateIds],
    selected_payment_id: result.selectedPaymentId,
    selected_utr: result.selectedUtr,
    expected_settlement: result.expectedSettlement,
    actual_settlement: result.actualSettlement,
    amount_difference: result.amountDifference,
    unexplained_shortfall: result.unexplainedShortfall,
    settlement_lag_days: result.settlementLagWorkingDays,
    rules_evaluated: [...result.rulesEvaluated],
    rule_fired: result.status,
    classification: result.status,
    reconciled: result.reconciled,
    confidence: result.confidence,
    reason: result.reason,
    llm_consulted:
      llm.llm_status === "AVAILABLE" ||
      (llm.llm_status === "UNAVAILABLE" && llm.llm_error_code !== "MISSING_CONFIGURATION"),
    llm_status: llm.llm_status,
    llm_error_code: llm.llm_error_code,
    llm_explanation: llm.llm_explanation,
    llm_time_ms: llm.llm_time_ms
  };
}

export async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function writeAuditTrail(filePath: string, entries: readonly AuditEntry[]): Promise<void> {
  await writeJsonAtomically(filePath, entries);
}
