export type PaymentMode = "UPI" | "CARD" | "NETBANKING";

export type GroundTruthCategory =
  | "EXACT_MATCH"
  | "FEE_ADJUSTED_MATCH"
  | "POSSIBLE_REFUND"
  | "NO_SETTLEMENT_FOUND"
  | "DUPLICATE_REFERENCE"
  | "DELAYED_SETTLEMENT";

export interface MerchantOrder {
  order_id: string;
  amount: number;
  order_date: string;
  customer_name: string;
  payment_mode: PaymentMode;
}

export interface SettlementRecord {
  payment_id: string;
  utr: string;
  settled_amount: number;
  settlement_date: string;
  fee_deducted: number;
  gst_on_fee: number;
  linked_order_id: string;
}

export interface GroundTruthEntry {
  ground_truth: GroundTruthCategory;
  expected_settlement: number;
  payment_id: string | null;
  metadata: {
    settlement_lag_working_days: number | null;
    adjustment_amount?: number;
    refund_shortfall?: number;
    duplicate_utr?: string;
  };
}

export type GroundTruth = Record<string, GroundTruthEntry>;

export interface GeneratedDataset {
  seed: number;
  merchantLedger: MerchantOrder[];
  settlementReport: SettlementRecord[];
  groundTruth: GroundTruth;
  distribution: Record<GroundTruthCategory, number>;
}
