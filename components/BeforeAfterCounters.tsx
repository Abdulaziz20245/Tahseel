"use client";

// Payments and cash, before → after (Claude.md §3.4). Values come from computeMetrics (lib/metrics.ts),
// the same source as the Government tab.

import { change, type MetricRow, type Metrics } from "@/lib/metrics";
import { num, pct, sar } from "@/lib/format";

function Change({ row }: { row: MetricRow }) {
  const c = change(row);
  if (c.pct === null) return <span className="text-muted">n/a (no baseline)</span>;
  const cls = { better: "text-good", worse: "text-bad", equal: "text-muted" }[c.direction];
  const arrow = c.abs === 0 ? "→" : c.abs < 0 ? "↓" : "↑";
  return (
    <span className={`font-semibold ${cls}`}>
      {arrow} {pct(Math.abs(c.pct))} {c.abs === 0 ? "" : c.abs < 0 ? "fewer" : "more"}
    </span>
  );
}

function Stat({ row, fmt, note }: { row: MetricRow; fmt: (n: number) => string; note: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{row.label}</p>
      <p className="num mt-1 text-sm text-muted">
        Before <span className="text-ink">{row.before === 0 ? "—" : fmt(row.before)}</span>
      </p>
      <p className="num text-xl font-semibold text-ink">{row.before === 0 && row.after === 0 ? "—" : fmt(row.after)}</p>
      <p className="num text-xs">
        <Change row={row} />
      </p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

export default function BeforeAfterCounters({ metrics, solving }: { metrics: Metrics | null; solving: boolean }) {
  return (
    <section aria-labelledby="counters-heading" className="rounded-md border border-line bg-canvas p-4">
      <div className="flex items-center justify-between">
        <h2 id="counters-heading" className="text-sm font-semibold text-ink">
          Paid one by one vs. through Tahseel
        </h2>
        {solving && (
          <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
            <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
            Solving…
          </span>
        )}
      </div>
      {metrics ? (
        <div aria-live="polite" className="mt-3 grid grid-cols-2 gap-4">
          <Stat row={metrics.rows.payments} fmt={num} note="Before: one per invoice. After: hub transfers." />
          <Stat row={metrics.rows.cash} fmt={sar} note="After: only net amounts move through the hub." />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Loading the optimiser…</p>
      )}
    </section>
  );
}
