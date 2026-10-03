"use client";

// Network tab (Claude.md §3.4): graph on the left (~65%), counters, event card and detail on the right.

import { useMemo, useState } from "react";
import { buildGraphModel } from "@/lib/graphModel";
import { useLedger, useMetrics, usePlan, useScenario } from "@/lib/ScenarioProvider";
import BeforeAfterCounters from "./BeforeAfterCounters";
import EventCard from "./EventCard";
import GraphCanvas, { type GraphView } from "./GraphCanvas";
import NodeDetailCard from "./NodeDetailCard";
import RoundLegend from "./RoundLegend";

export default function NetworkView() {
  const { data, stepIndex, selectedCompanyId, setSelectedCompanyId, selectedRoundDate, setSelectedRoundDate } = useScenario();
  const { ledger } = useLedger();
  const { plan, previousPlan, isSolving, method, loadError, error, changedAt } = usePlan();
  const [view, setView] = useState<GraphView>("after");
  const [edgeId, setEdgeId] = useState<string | null>(null);

  const model = useMemo(() => buildGraphModel({ data, ledger, plan, previousPlan, changedAt }), [data, ledger, plan, previousPlan, changedAt]);
  const metrics = useMetrics();

  const failedChecks = plan?.checks.filter((c) => !c.ok) ?? [];
  const invalid = !!plan?.error || !!error || failedChecks.length > 0;
  const effectiveView: GraphView = invalid || !plan ? "before" : view;
  // Default round = earliest; a remembered round that no longer exists falls back to it.
  const roundDate = model.rounds.some((r) => r.date === selectedRoundDate) ? selectedRoundDate : (model.rounds[0]?.date ?? null);
  const empty = model.pairEdges.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        {method === "heuristic" && (
          <p role="alert" className="rounded-md border border-warn bg-canvas px-3 py-2 text-sm text-warn">
            Exact solver failed to load — showing heuristic plan (optimality not proven).{loadError ? ` ${loadError}` : ""}
          </p>
        )}
        {invalid && (
          <p role="alert" className="rounded-md border border-bad bg-canvas px-3 py-2 text-sm text-bad">
            Validator failed: {plan?.error ?? error ?? failedChecks.map((c) => c.label).join("; ")}. Showing the baseline only.
          </p>
        )}
        <div className="relative h-[calc(100vh-222px)] min-h-[480px] overflow-hidden rounded-md border border-line bg-subtle">
          <GraphCanvas
            model={model}
            view={effectiveView}
            roundDate={roundDate}
            selectedCompanyId={selectedCompanyId}
            selectedEdgeId={edgeId}
            dimmed={isSolving && !!plan}
            pulseStep={stepIndex}
            onSelectCompany={(id) => {
              setEdgeId(null);
              setSelectedCompanyId(id);
            }}
            onSelectEdge={(id) => {
              setEdgeId(id);
              setSelectedCompanyId(null);
            }}
            onClear={() => {
              setEdgeId(null);
              setSelectedCompanyId(null);
            }}
          >
            <div className="absolute top-3 right-3 left-3 z-10 flex items-center gap-3">
              <div role="group" aria-label="View" className="flex rounded-md border border-line bg-canvas p-0.5 text-sm">
                {(["before", "after"] as const).map((v) => {
                  const disabled = v === "after" && (invalid || !plan);
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={effectiveView === v}
                      aria-disabled={disabled}
                      title={disabled ? "No valid plan to show" : undefined}
                      onClick={() => !disabled && setView(v)}
                      className={`rounded-md px-3 py-1 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                        effectiveView === v ? "bg-primary font-semibold text-white" : "text-muted hover:text-ink"
                      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                    >
                      {v === "before" ? "Before" : "After"}
                    </button>
                  );
                })}
              </div>
              <p className="hidden text-xs text-muted md:block">
                {effectiveView === "before"
                  ? "Before: every open invoice paid separately, on its due date."
                  : "After: only net amounts move through the hub; each company pays or is paid at most once per round."}
              </p>
            </div>
            {empty && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <p className="rounded-md border border-line bg-canvas px-4 py-2 text-sm text-muted">Nothing to settle at this step</p>
              </div>
            )}
            <RoundLegend view={effectiveView} rounds={model.rounds} selected={roundDate} onSelect={setSelectedRoundDate} />
          </GraphCanvas>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <BeforeAfterCounters metrics={metrics} solving={isSolving} />
        <EventCard />
        <NodeDetailCard model={model} ledger={ledger} plan={plan} companyId={selectedCompanyId} edgeId={edgeId} />
      </div>
    </div>
  );
}
