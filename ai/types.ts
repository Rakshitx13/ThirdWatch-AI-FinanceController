import { MerchantOrder, SettlementRecord } from "../data-generator/types";
import { ReconciliationResult, SettlementCandidate } from "../matching-engine/types";

export type LlmStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_REQUIRED";
export type LlmErrorCode =
  | "MISSING_CONFIGURATION"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "EMPTY_RESPONSE"
  | "API_ERROR";

export interface AmbiguityEvidence {
  order: MerchantOrder;
  deterministic_result: Pick<
    ReconciliationResult,
    | "status"
    | "reconciled"
    | "confidence"
    | "reason"
    | "expectedSettlement"
    | "actualSettlement"
    | "amountDifference"
    | "unexplainedShortfall"
    | "settlementLagWorkingDays"
  >;
  candidate_settlements: Array<
    SettlementRecord & {
      candidate_score: number;
      candidate_signals: string[];
      calculated_expected_settlement: number;
      calculated_difference: number;
      calculated_lag_working_days: number;
    }
  >;
}

export interface LlmExplanationResult {
  llm_explanation: string | null;
  llm_status: LlmStatus;
  llm_error_code: LlmErrorCode | null;
  llm_time_ms: number;
}

export interface ExplanationClient {
  requestExplanation(prompt: string): Promise<string>;
}

export interface ExplainAmbiguityInput {
  order: MerchantOrder;
  result: ReconciliationResult;
  candidates: readonly SettlementCandidate[];
}
