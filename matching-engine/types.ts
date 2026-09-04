import { MerchantOrder, SettlementRecord } from "../data-generator/types";

export type ReconciliationStatus =
  | "EXACT_MATCH"
  | "FEE_ADJUSTED_MATCH"
  | "POSSIBLE_REFUND"
  | "NO_SETTLEMENT_FOUND"
  | "DUPLICATE_REFERENCE"
  | "DELAYED_SETTLEMENT";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type CandidateSignal =
  | "LINKED_ORDER_ID_EXACT"
  | "LINKED_ORDER_ID_CONFLICT"
  | "SETTLEMENT_AMOUNT_EXACT"
  | "SETTLEMENT_AMOUNT_WITHIN_EXACT_TOLERANCE"
  | "SETTLEMENT_AMOUNT_WITHIN_WIDE_TOLERANCE"
  | "NORMAL_SETTLEMENT_WINDOW"
  | "EXTENDED_SETTLEMENT_WINDOW"
  | "FEE_AND_GST_PROFILE_VALID";

export interface SettlementCandidate {
  order: MerchantOrder;
  settlement: SettlementRecord;
  score: number;
  signals: CandidateSignal[];
  expectedSettlement: number;
  amountDifference: number;
  settlementLagWorkingDays: number;
}

export interface RuleEvaluation {
  matched: boolean;
  rule: ReconciliationStatus;
  reason: string;
}

export interface ReconciliationResult {
  orderId: string;
  status: ReconciliationStatus;
  reconciled: boolean;
  confidence: Confidence;
  reason: string;
  candidateIds: string[];
  selectedPaymentId: string | null;
  selectedUtr: string | null;
  expectedSettlement: number | null;
  actualSettlement: number | null;
  amountDifference: number | null;
  unexplainedShortfall: number | null;
  settlementLagWorkingDays: number | null;
  rulesEvaluated: string[];
}
