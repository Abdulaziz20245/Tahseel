"use client";

// Government tab (Claude.md §3.4, §6): before vs after for the same open invoices at the same step.

import { useMetrics, usePlan, useScenario } from "@/lib/ScenarioProvider";
import MetricGrid from "./MetricGrid";
import OverdueList from "./OverdueList";
import RoundsTable from "./RoundsTable";
import TheoreticalMaxBar from "./TheoreticalMaxBar";

export default function GovernmentView() {
  const { data } = useScenario();
  const { isSolving, method } = usePlan();
  const metrics = useMetrics();

  if (!metrics) return <p className="text-sm text-muted">Loading the optimiser…</p>;
  return (
    <div className={`flex flex-col gap-6 transition-opacity ${isSolving ? "opacity-60" : ""}`}>
      {isSolving && (
        <p role="status" className="text-sm text-muted">
          Solving the new step… the figures below are from the previous step.
        </p>
      )}
      {!metrics.planAvailable && (
        <p role="alert" className="rounded-md border border-bad px-3 py-2 text-sm text-bad">
          No valid plan at this step — &ldquo;after&rdquo; shows the baseline.
        </p>
      )}
      {method === "heuristic" && (
        <p role="alert" className="rounded-md border border-warn px-3 py-2 text-sm text-warn">
          Exact solver failed to load — figures come from the heuristic plan (optimality not proven).
        </p>
      )}
      <MetricGrid metrics={metrics} />
      <TheoreticalMaxBar metrics={metrics} />
      <div className="grid gap-6 xl:grid-cols-2">
        <RoundsTable rounds={metrics.rounds} />
        <OverdueList metrics={metrics} maxDays={data.settings.maxPaymentDays} />
      </div>
      <p className="text-xs text-muted">
        Synthetic Saudi scenario. Results show what the model computes for this data, not measured real-world impact. Before = every open
        invoice paid in full, separately, on its due date; held, escalated and overdue invoices are excluded from both sides and listed
        above.
      </p>
    </div>
  );
}
