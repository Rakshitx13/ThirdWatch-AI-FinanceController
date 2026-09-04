export type ReconciliationStatus =
  | "EXACT_MATCH"
  | "FEE_ADJUSTED_MATCH"
  | "POSSIBLE_REFUND"
  | "NO_SETTLEMENT_FOUND"
  | "DUPLICATE_REFERENCE"
  | "DELAYED_SETTLEMENT";

export interface Summary {
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
  deterministic_processing_time_ms: number;
  llm_time_ms: number;
  total_processing_time_ms: number;
  processing_time_ms: number;
  records_per_second: number;
}

export interface MerchantOrder {
  order_id: string;
  amount: number;
  order_date: string;
  customer_name: string;
  payment_mode: string;
}

export interface Settlement {
  payment_id: string;
  utr: string;
  settled_amount: number;
  settlement_date: string;
  fee_deducted: number;
  gst_on_fee: number;
  linked_order_id: string;
}

export interface ReconciliationResult {
  orderId: string;
  status: ReconciliationStatus;
  reconciled: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
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
  llm_explanation: string | null;
  llm_status: "AVAILABLE" | "UNAVAILABLE" | "NOT_REQUIRED";
  llm_error_code: string | null;
  llm_time_ms: number;
  order: MerchantOrder;
  selectedSettlement: Settlement | null;
  candidateSettlements: Settlement[];
}

export interface AuditEntry {
  order_id: string;
  timestamp: string;
  candidate_ids: string[];
  rules_evaluated: string[];
  rule_fired: string;
  classification: ReconciliationStatus;
  reconciled: boolean;
  confidence: string;
  reason: string;
  llm_consulted: boolean;
  llm_status: string;
  llm_explanation: string | null;
}
