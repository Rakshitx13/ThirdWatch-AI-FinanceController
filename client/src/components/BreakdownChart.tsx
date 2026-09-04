import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Summary } from "../types";

const colors = ["#1f7a63", "#39718c", "#d18b36", "#bb4b3f", "#7a443c", "#945c78"];

export function BreakdownChart({ summary }: { summary: Summary }) {
  const data = [
    { name: "Exact", value: summary.exact_matches },
    { name: "Fee-adjusted", value: summary.fee_adjusted_matches },
    { name: "Delayed", value: summary.delayed_settlements },
    { name: "Refund", value: summary.possible_refunds },
    { name: "Missing", value: summary.missing_settlements },
    { name: "Duplicate", value: summary.duplicate_references }
  ];
  return (
    <section className="panel breakdown-panel" aria-labelledby="breakdown-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Batch composition</p>
          <h2 id="breakdown-title">Reconciliation breakdown</h2>
        </div>
        <span className="panel-note">{summary.total_records} orders</span>
      </div>
      <div className="breakdown-body">
        <div className="chart-wrap" aria-label="Donut chart showing reconciliation status counts">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2}>
                {data.map((entry, index) => <Cell key={entry.name} fill={colors[index]} />)}
              </Pie>
              <Tooltip formatter={(value) => [`${value} records`, "Count"]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-center"><strong>{summary.overall_match_rate}%</strong><span>matched</span></div>
        </div>
        <div className="legend-grid">
          {data.map((item, index) => (
            <div className="legend-item" key={item.name}>
              <span className="legend-dot" style={{ backgroundColor: colors[index] }} />
              <span>{item.name}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
