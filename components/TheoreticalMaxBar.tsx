"use client";

// Set-off achieved vs. the theoretical maximum (Claude.md §6), drawn with plain divs (D13).

import type { Metrics } from "@/lib/metrics";
import { pct, sar } from "@/lib/format";

export default function TheoreticalMaxBar({ metrics }: { metrics: Metrics }) {
  const { cashBefore, cashAfter, minCash } = metrics;
  if (cashBefore === 0) {
    return (
      <section className="rounded-md border border-line bg-canvas p-4 text-sm text-muted">Set-off vs. theoretical maximum: — (no open invoices)</section>
    );
  }
  const achieved = Math.max(0, cashBefore - cashAfter);
  const maximum = cashBefore - minCash;
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / cashBefore) * 100))}%`;

  return (
    <section aria-labelledby="tmax-heading" className="rounded-md border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tmax-heading" className="text-sm font-semibold text-ink">
          Set-off achieved vs. theoretical maximum
        </h2>
        <p className="num text-sm text-ink">
          <span className="font-semibold">{pct(metrics.rows.theoreticalShare.afterValue)}</span> of the maximum
        </p>
      </div>
      <div className="relative mt-3 h-6 w-full overflow-hidden rounded-md border border-line bg-subtle" role="img"
        aria-label={`Of ${sar(cashBefore)} owed, ${sar(achieved)} is cleared by set-off; at most ${sar(maximum)} could be.`}>
        <div className="absolute inset-y-0 left-0 border-r-2 border-dashed border-primary" style={{ width: w(maximum) }} />
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: w(achieved) }} />
      </div>
      <dl className="num mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-sm bg-accent" />
          <dt className="text-muted">Cleared by set-off</dt>
          <dd className="ml-auto font-semibold sm:ml-0">{sar(achieved)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-sm border-2 border-dashed border-primary" />
          <dt className="text-muted">Theoretical maximum</dt>
          <dd className="ml-auto font-semibold sm:ml-0">{sar(maximum)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-sm border border-line bg-subtle" />
          <dt className="text-muted">Owed in total</dt>
          <dd className="ml-auto font-semibold sm:ml-0">{sar(cashBefore)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        The maximum assumes every invoice could settle on one day, so only each company&apos;s overall net position moves ({sar(minCash)}).
        Due dates, time limits and caps make some of it unreachable.
      </p>
    </section>
  );
}
