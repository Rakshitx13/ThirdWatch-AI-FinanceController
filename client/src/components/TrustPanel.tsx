import { CheckCircle2, ShieldCheck } from "lucide-react";

const claims = [
  "Deterministic financial classification",
  "Claude used only for ambiguity explanation",
  "Every decision audited",
  "Ground-truth validation enabled",
  "No forced matches"
];

export function TrustPanel() {
  return (
    <section className="panel trust-panel" aria-labelledby="trust-title">
      <div className="trust-title-row">
        <span className="trust-icon"><ShieldCheck size={22} /></span>
        <div><p className="eyebrow">Control boundary</p><h2 id="trust-title">AI role</h2></div>
      </div>
      <div className="trust-list">
        {claims.map((claim) => <div key={claim}><CheckCircle2 size={16} aria-hidden="true" /><span>{claim}</span></div>)}
      </div>
      <p className="trust-footnote">Claude cannot change a reconciliation status or financial value.</p>
    </section>
  );
}
