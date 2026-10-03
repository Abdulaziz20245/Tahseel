"use client";

// "In numbers" grid (Claude.md §6, §10): one card per metric — after large, before small, change with
// a direction arrow. Worse results are shown as worse.

import { change, type MetricRow, type Metrics } from "@/lib/metrics";
import { num, pct, sar } from "@/lib/format";

function fmt(row: MetricRow, v: number | null): string {
  if (v === null) return "—";
  if (row.unit === "SAR") return sar(v);
  if (row.unit === "%") return pct(v);
  return num(v);
}

function ChangeLine({ row }: { row: MetricRow }) {
  if (row.unit === "%") {
    // Percentages: the change is shown in percentage points; with no baseline there is none.
    if (row.afterValue === null) return <span className="text-muted">— · n/a (no baseline)</span>;
    const pts = (row.after - row.before) * 100;
    const cls = Math.abs(pts) < 0.05 ? "text-muted" : pts > 0 ? "text-good" : "text-bad";
    return (
      <span className={`font-semibold ${cls}`}>
        {pts > 0.05 ? "↑" : pts < -0.05 ? "↓" : "→"} {Math.abs(pts).toFixed(1)} pts
      </span>
    );
  }
  const c = change(row);
  if (c.pct === null) {
    return <span className="text-muted">{row.after === 0 ? "—" : row.unit === "SAR" ? sar(c.abs) : num(c.abs)} · n/a (no baseline)</span>;
  }
  const cls = { better: "text-good", worse: "text-bad", equal: "text-muted" }[c.direction];
  const arrow = c.abs > 0 ? "↑" : c.abs < 0 ? "↓" : "→";
  const absText = row.unit === "SAR" ? sar(Math.abs(c.abs)) : num(Math.abs(c.abs));
  return (
    <span className={`font-semibold ${cls}`}>
      {arrow} {absText} ({pct(Math.abs(c.pct))}) {c.direction === "equal" ? "no change" : c.direction}
    </span>
  );
}

function MetricCard({ row }: { row: MetricRow }) {
  return (
    <div className="flex flex-col rounded-md border border-line bg-canvas p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{row.label}</p>
        <span className="shrink-0 text-xs text-muted">{row.better === "lower" ? "lower is better" : "higher is better"}</span>
      </div>
      <p className="num mt-2 text-2xl font-semibold text-ink">{fmt(row, row.afterValue)}</p>
      {row.secondary && <p className="num text-sm text-ink">{sar(row.secondary.after)}</p>}
      <p className="num mt-1 text-sm text-muted">
        Before: {fmt(row, row.beforeValue)}
        {row.secondary ? ` · ${sar(row.secondary.before)}` : ""}
      </p>
      <p className="num mt-1 text-sm">
        <ChangeLine row={row} />
      </p>
      {row.illustrative && (
        <p className="mt-2 w-fit rounded-md border border-warn px-1.5 py-0.5 text-xs font-semibold text-warn">{row.illustrative}</p>
      )}
      {row.note && <p className="mt-2 text-xs text-muted">{row.note}</p>}
    </div>
  );
}

export default function MetricGrid({ metrics }: { metrics: Metrics }) {
  return (
    <section aria-labelledby="metrics-heading">
      <h2 id="metrics-heading" className="sr-only">
        Metrics, before and after
      </h2>
      <div aria-live="polite" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.order.map((k) => (
          <MetricCard key={k} row={metrics.rows[k]} />
        ))}
      </div>
    </section>
  );
}
