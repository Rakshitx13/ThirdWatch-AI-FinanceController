import { LucideIcon } from "lucide-react";

export function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card-top">
        <span>{label}</span>
        <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
