import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Landmark,
  Play,
  RefreshCw,
  Rows3,
  Sparkles
} from "lucide-react";
import { DetailDrawer } from "./components/DetailDrawer";
import { ExceptionTable, FilterValue } from "./components/ExceptionTable";
import { SummaryCard } from "./components/SummaryCard";
import { TrustPanel } from "./components/TrustPanel";
import { ApiError, api } from "./services/api";
import { AuditEntry, ReconciliationResult, Summary } from "./types";

type Operation = "loading" | "generating" | "reconciling" | "refreshing" | null;

const BreakdownChart = lazy(() =>
  import("./components/BreakdownChart").then((module) => ({ default: module.BreakdownChart }))
);

function formatRunTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [exceptions, setExceptions] = useState<ReconciliationResult[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [operation, setOperation] = useState<Operation>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReconciliationResult | null>(null);

  const loadDashboard = useCallback(async (nextOperation: Operation = "refreshing") => {
    setOperation(nextOperation);
    setError(null);
    try {
      const [nextSummary, exceptionResponse, auditResponse] = await Promise.all([
        api.getReport(), api.getExceptions(), api.getAudit()
      ]);
      setSummary(nextSummary);
      setExceptions(exceptionResponse.exceptions);
      setAudit(auditResponse.audit);
      setNotice(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setSummary(null);
        setExceptions([]);
        setAudit([]);
        setNotice("No reconciliation report yet. Generate a dataset, then run reconciliation.");
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to load the finance report.");
      }
    } finally {
      setOperation(null);
    }
  }, []);

  useEffect(() => { void loadDashboard("loading"); }, [loadDashboard]);

  async function generateDataset() {
    setOperation("generating"); setError(null); setNotice(null);
    try {
      const response = await api.generate(100, 42);
      setSummary(null); setExceptions([]); setAudit([]); setSelected(null);
      setNotice(`Generated ${response.records} synthetic orders with seed ${response.seed}. Run reconciliation when ready.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dataset generation failed.");
    } finally { setOperation(null); }
  }

  async function runReconciliation() {
    setOperation("reconciling"); setError(null); setNotice(null);
    try {
      await api.reconcile();
      await loadDashboard("reconciling");
      setNotice("Reconciliation completed. All orders have an auditable outcome.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reconciliation failed.");
      setOperation(null);
    }
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exceptions.filter((row) => {
      if (filter !== "ALL" && row.status !== filter) return false;
      if (!query) return true;
      return [row.orderId, row.selectedUtr ?? "", row.reason, row.order.customer_name]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [exceptions, filter, search]);

  const isBusy = operation !== null;
  const selectedAudit = selected ? audit.find((entry) => entry.order_id === selected.orderId) : undefined;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><Landmark size={22} strokeWidth={1.8} /></span>
          <div><h1>ThirdWatch — AI Finance Controller</h1><p>Multi-Source Reconciliation</p></div>
        </div>
        <div className="run-context">
          <div><span>Run ID</span><strong>{summary?.run_id ?? "Not started"}</strong></div>
          <div><span>Dataset</span><strong>Synthetic Payment Settlement Batch</strong></div>
        </div>
        <div className="header-actions">
          <button className="button-secondary" onClick={generateDataset} disabled={isBusy}><Sparkles size={16} />{operation === "generating" ? "Generating…" : "Generate Dataset"}</button>
          <button className="button-primary" onClick={runReconciliation} disabled={isBusy}><Play size={16} fill="currentColor" />{operation === "reconciling" ? "Reconciling…" : "Run Reconciliation"}</button>
          <button className="icon-button refresh-button" onClick={() => void loadDashboard()} disabled={isBusy} aria-label="Refresh dashboard"><RefreshCw className={operation === "refreshing" ? "spin" : ""} size={18} /></button>
        </div>
      </header>

      <main>
        <section className="page-intro">
          <div><p className="eyebrow">Finance operations control room</p><h2>Run the books and the cash position.</h2><p>Automate the obvious, measure the uncertain, and escalate only what needs a human decision.</p></div>
          {summary && <div className="run-freshness"><Activity size={16} /><span>Last completed {formatRunTime(summary.generated_at)}</span><strong>{summary.false_matches} false matches</strong></div>}
        </section>

        {(notice || error) && <div className={`notice-banner ${error ? "notice-error" : "notice-success"}`} role={error ? "alert" : "status"}>{error ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}<span>{error ?? notice}</span></div>}

        {operation === "loading" && !summary ? <div className="loading-state"><RefreshCw className="spin" /><span>Loading finance controls…</span></div> : summary ? (
          <>
            <section className="metrics-grid" aria-label="Reconciliation summary metrics">
              <SummaryCard label="Total transactions" value={String(summary.total_records)} detail="Merchant orders processed" icon={Rows3} />
              <SummaryCard label="Reconciled" value={String(summary.total_reconciled)} detail="Exact, adjusted, and delayed" icon={CheckCircle2} tone="success" />
              <SummaryCard label="Match rate" value={`${summary.overall_match_rate}%`} detail={`${summary.classification_accuracy}% classification accuracy`} icon={Gauge} tone="success" />
              <SummaryCard label="Exceptions" value={String(summary.unresolved_exceptions)} detail={`${summary.exception_rate}% requires investigation`} icon={AlertTriangle} tone="warning" />
              <SummaryCard label="Processing time" value={`${summary.processing_time_ms.toFixed(2)} ms`} detail={`${summary.llm_time_ms.toFixed(2)} ms Claude time`} icon={Activity} />
              <SummaryCard label="Records / sec" value={Math.round(summary.records_per_second).toLocaleString("en-IN")} detail="Deterministic throughput" icon={Gauge} />
            </section>

            <section className="insights-grid">
              <Suspense fallback={<section className="panel chart-loading">Loading reconciliation breakdown…</section>}>
                <BreakdownChart summary={summary} />
              </Suspense>
              <TrustPanel />
            </section>
            <ExceptionTable rows={filteredRows} activeFilter={filter} search={search} onFilterChange={setFilter} onSearchChange={setSearch} onSelect={setSelected} />
          </>
        ) : (
          <section className="empty-state"><span><Landmark size={28} /></span><h2>No closed batch yet</h2><p>Generate the deterministic seed-42 dataset, then run reconciliation to populate the control room.</p><div><button className="button-secondary" onClick={generateDataset} disabled={isBusy}><Sparkles size={16} />Generate Dataset</button><button className="button-primary" onClick={runReconciliation} disabled={isBusy}><Play size={16} fill="currentColor" />Run Reconciliation</button></div></section>
        )}
      </main>
      <footer><span>ThirdWatch — AI Finance Controller</span><span>Deterministic first · AI-assisted explanations · Complete audit trail</span></footer>
      {selected && <DetailDrawer row={selected} audit={selectedAudit} onClose={() => setSelected(null)} />}
    </div>
  );
}
