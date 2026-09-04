import { ReconciliationStatus } from "../types";

export const statusMeta: Record<ReconciliationStatus, { label: string; tone: string }> = {
  EXACT_MATCH: { label: "Exact", tone: "success" },
  FEE_ADJUSTED_MATCH: { label: "Fee-adjusted", tone: "info" },
  DELAYED_SETTLEMENT: { label: "Delayed", tone: "warning" },
  POSSIBLE_REFUND: { label: "Possible refund", tone: "danger" },
  NO_SETTLEMENT_FOUND: { label: "Missing", tone: "danger" },
  DUPLICATE_REFERENCE: { label: "Duplicate UTR", tone: "danger" }
};

export function StatusBadge({ status }: { status: ReconciliationStatus }) {
  const meta = statusMeta[status];
  return <span className={`status-badge status-${meta.tone}`}>{meta.label}</span>;
}
