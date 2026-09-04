import { useEffect } from "react";
import { Bot, Calculator, FileSearch, Landmark, X } from "lucide-react";
import { AuditEntry, ReconciliationResult } from "../types";
import { StatusBadge } from "./StatusBadge";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function DetailDrawer({ row, audit, onClose }: { row: ReconciliationResult; audit?: AuditEntry; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const settlement = row.selectedSettlement ?? row.candidateSettlements[0] ?? null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="drawer-header">
          <div><p className="eyebrow">Investigation detail</p><h2 id="detail-title">{row.orderId}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close detail"><X size={20} /></button>
        </header>
        <div className="drawer-status"><StatusBadge status={row.status} /><span>{row.confidence} confidence</span></div>
        <section className="drawer-section"><h3><FileSearch size={17} />Order information</h3><dl className="detail-grid"><div><dt>Customer</dt><dd>{row.order.customer_name}</dd></div><div><dt>Order amount</dt><dd>{currency.format(row.order.amount)}</dd></div><div><dt>Order date</dt><dd>{row.order.order_date}</dd></div><div><dt>Payment mode</dt><dd>{row.order.payment_mode}</dd></div></dl></section>
        <section className="drawer-section"><h3><Landmark size={17} />Settlement evidence</h3>{settlement ? <dl className="detail-grid"><div><dt>Payment ID</dt><dd>{settlement.payment_id}</dd></div><div><dt>UTR</dt><dd>{settlement.utr}</dd></div><div><dt>Settlement date</dt><dd>{settlement.settlement_date}</dd></div><div><dt>Working-day lag</dt><dd>{row.settlementLagWorkingDays ?? "—"}</dd></div><div><dt>Gateway fee</dt><dd>{currency.format(settlement.fee_deducted)}</dd></div><div><dt>GST on fee</dt><dd>{currency.format(settlement.gst_on_fee)}</dd></div></dl> : <p className="muted-copy">No settlement row was selected. {row.candidateIds.length} candidate row(s) were evaluated.</p>}</section>
        <section className="drawer-section calculation-card"><h3><Calculator size={17} />Expected vs actual</h3><div className="calculation-row"><span>Expected settlement</span><strong>{row.expectedSettlement === null ? "Not calculable" : currency.format(row.expectedSettlement)}</strong></div><div className="calculation-row"><span>Actual settlement</span><strong>{row.actualSettlement === null ? "Not found" : currency.format(row.actualSettlement)}</strong></div><div className="calculation-row difference-row"><span>{row.unexplainedShortfall ? "Unexplained shortfall" : "Absolute difference"}</span><strong>{currency.format(row.unexplainedShortfall ?? Math.abs(row.amountDifference ?? 0))}</strong></div></section>
        <section className="drawer-section"><h3>Deterministic decision</h3><p className="reason-copy">{row.reason}</p><div className="rule-flow">{(audit?.rules_evaluated ?? row.rulesEvaluated).map((rule, index) => <span key={`${rule}-${index}`} className={rule === row.status ? "rule-fired" : ""}>{rule.replaceAll("_", " ")}</span>)}</div></section>
        <section className="drawer-section ai-explanation"><h3><Bot size={17} />AI explanation</h3>{row.llm_explanation ? <p>{row.llm_explanation}</p> : <p className="muted-copy">{row.llm_status === "UNAVAILABLE" ? "Claude was unavailable. The deterministic result remains complete and unchanged." : "Claude was not required for this decision."}</p>}</section>
      </aside>
    </div>
  );
}
