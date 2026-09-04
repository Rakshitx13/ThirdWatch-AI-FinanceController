import { ChevronRight, Search } from "lucide-react";
import { ReconciliationResult, ReconciliationStatus } from "../types";
import { StatusBadge } from "./StatusBadge";

export type FilterValue = "ALL" | Exclude<ReconciliationStatus, "EXACT_MATCH">;

const filters: Array<{ value: FilterValue; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "POSSIBLE_REFUND", label: "Refund" },
  { value: "NO_SETTLEMENT_FOUND", label: "Missing" },
  { value: "DUPLICATE_REFERENCE", label: "Duplicate" },
  { value: "DELAYED_SETTLEMENT", label: "Delayed" },
  { value: "FEE_ADJUSTED_MATCH", label: "Fee-adjusted" }
];

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function ExceptionTable({
  rows,
  activeFilter,
  search,
  onFilterChange,
  onSearchChange,
  onSelect
}: {
  rows: ReconciliationResult[];
  activeFilter: FilterValue;
  search: string;
  onFilterChange: (value: FilterValue) => void;
  onSearchChange: (value: string) => void;
  onSelect: (row: ReconciliationResult) => void;
}) {
  return (
    <section className="panel exception-panel" aria-labelledby="exceptions-title">
      <div className="exception-header">
        <div><p className="eyebrow">Review queue</p><h2 id="exceptions-title">Exceptions &amp; warnings</h2></div>
        <span className="queue-count">{rows.length} visible</span>
      </div>
      <div className="table-tools">
        <div className="filter-list" aria-label="Filter exceptions">
          {filters.map((filter) => (
            <button
              key={filter.value}
              className={activeFilter === filter.value ? "filter-active" : ""}
              onClick={() => onFilterChange(filter.value)}
              type="button"
            >{filter.label}</button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search exceptions</span>
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search order, UTR, reason" />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Order</th><th>Status</th><th>Amount</th><th>Expected</th><th>Actual</th><th>Difference</th><th>Settlement</th><th>Confidence</th><th><span className="sr-only">Open</span></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orderId} onClick={() => onSelect(row)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onSelect(row); }}>
                <td><strong>{row.orderId}</strong><span>{row.order.customer_name}</span></td>
                <td><StatusBadge status={row.status} /></td>
                <td>{currency.format(row.order.amount)}</td>
                <td>{row.expectedSettlement === null ? "—" : currency.format(row.expectedSettlement)}</td>
                <td>{row.actualSettlement === null ? "—" : currency.format(row.actualSettlement)}</td>
                <td className={row.amountDifference && Math.abs(row.amountDifference) > 5 ? "negative-value" : ""}>{row.amountDifference === null ? "—" : currency.format(Math.abs(row.amountDifference))}</td>
                <td>{row.selectedSettlement?.settlement_date ?? row.candidateSettlements[0]?.settlement_date ?? "—"}</td>
                <td><span className={`confidence confidence-${row.confidence.toLowerCase()}`}>{row.confidence}</span></td>
                <td><ChevronRight size={17} aria-hidden="true" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-table">No records match the current filter.</div>}
      </div>
    </section>
  );
}
