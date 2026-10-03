"use client";

// Shared scenario state (Claude.md §3.2, §9.3). Only stepIndex and selections are stored; the ledger
// and plan come from one replay + solve in the solver worker, so they always belong together.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyEvents, type EventResult } from "./ledger";
import { computeMetrics, type Metrics } from "./metrics";
import type { StepResult } from "./optimizer/engine";
import { createSolveClient, type SolveClient, type SolveOutcome } from "./optimizer/solveClient";
import type { CompanyId, Dataset, Ledger, Plan } from "./types";

interface SolverState {
  outcome: SolveOutcome | null; // last good result (may be for an earlier step while solving)
  error: string | null;
}

interface ScenarioState {
  data: Dataset;
  stepCount: number; // N, the number of scripted events
  stepIndex: number; // 0..N: how many events are applied
  setStep: (k: number) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
  selectedCompanyId: CompanyId | null;
  setSelectedCompanyId: (id: CompanyId | null) => void;
  selectedRoundDate: string | null;
  setSelectedRoundDate: (date: string | null) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  solver: SolverState;
}

const ScenarioContext = createContext<ScenarioState | null>(null);

export function ScenarioProvider({ data, children }: { data: Dataset; children: React.ReactNode }) {
  const stepCount = data.events.length;
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedCompanyId, setSelectedCompanyId] = useState<CompanyId | null>(null);
  const [selectedRoundDate, setSelectedRoundDate] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [solver, setSolver] = useState<SolverState>({ outcome: null, error: null });

  const setStep = useCallback(
    (k: number) => setStepIndex(Math.max(0, Math.min(stepCount, Math.trunc(k)))),
    [stepCount],
  );
  // Functional updates, so rapid clicks are applied one by one and never skip or overshoot.
  const next = useCallback(() => setStepIndex((s) => Math.min(stepCount, s + 1)), [stepCount]);
  const back = useCallback(() => setStepIndex((s) => Math.max(0, s - 1)), []);
  const reset = useCallback(() => {
    setStepIndex(0);
    setSelectedCompanyId(null);
    setSelectedRoundDate(null);
  }, []);

  // Solve on every step change; a result for a step that is no longer current is discarded (§4.7).
  const clientRef = useRef<SolveClient | null>(null);
  const currentStep = useRef(stepIndex);
  useEffect(() => {
    clientRef.current = createSolveClient();
    return () => clientRef.current?.dispose();
  }, []);
  useEffect(() => {
    currentStep.current = stepIndex;
    const client = clientRef.current;
    if (!client) return;
    client.request(stepIndex).then(
      (outcome) => {
        if (outcome && outcome.result.step === currentStep.current) setSolver({ outcome, error: null });
      },
      (err: Error) => {
        if (currentStep.current === stepIndex) setSolver((s) => ({ ...s, error: err.message }));
      },
    );
  }, [stepIndex]);

  const value = useMemo<ScenarioState>(
    () => ({
      data,
      stepCount,
      stepIndex,
      setStep,
      next,
      back,
      reset,
      selectedCompanyId,
      setSelectedCompanyId,
      selectedRoundDate,
      setSelectedRoundDate,
      assistantOpen,
      setAssistantOpen,
      solver,
    }),
    [data, stepCount, stepIndex, setStep, next, back, reset, selectedCompanyId, selectedRoundDate, assistantOpen, solver],
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario(): ScenarioState {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error("useScenario must be used inside <ScenarioProvider>");
  return ctx;
}

function useCurrentResult(): { result: StepResult | null; isSolving: boolean } {
  const { stepIndex, solver } = useScenario();
  const result = solver.outcome?.result ?? null;
  return { result, isSolving: !result || result.step !== stepIndex };
}

export interface LedgerView {
  ledger: Ledger;
  eventResults: EventResult[];
  /** True while the shown ledger belongs to an earlier step (the new step is being solved). */
  isStale: boolean;
}

/** Ledger from the same replay as the plan. Before the first solve (and on the server) it is a plain replay, which equals the solved one until a round is executed. */
export function useLedger(): LedgerView {
  const { data } = useScenario();
  const { result, isSolving } = useCurrentResult();
  const initial = useMemo(() => applyEvents(data, data.events, 0), [data]);
  if (!result) return { ledger: initial.ledger, eventResults: initial.eventResults, isStale: true };
  return { ledger: result.ledger, eventResults: result.eventResults, isStale: isSolving };
}

export interface PlanView {
  plan: Plan | null;
  previousPlan: Plan | null;
  isSolving: boolean;
  method: "mip" | "heuristic" | null;
  loadError: string | null;
  runtime: "worker" | "main-thread" | null;
  error: string | null;
  solveMs: number;
  changedAt: Record<CompanyId, number>; // last step each company's proposal changed
}

/** The plan for the current step; while a new step solves, the last good plan stays visible. */
export function usePlan(): PlanView {
  const { solver } = useScenario();
  const { result, isSolving } = useCurrentResult();
  return {
    plan: result?.plan ?? null,
    previousPlan: result?.previousPlan ?? null,
    isSolving,
    method: solver.outcome?.method ?? null,
    loadError: solver.outcome?.loadError ?? null,
    runtime: solver.outcome?.runtime ?? null,
    error: solver.error,
    solveMs: result?.solveMs ?? 0,
    changedAt: result?.changedAt ?? {},
  };
}

/** All §6 metrics for the current ledger and plan (lib/metrics.ts); null until the first plan arrives. */
export function useMetrics(): Metrics | null {
  const { data } = useScenario();
  const { ledger } = useLedger();
  const { plan } = usePlan();
  return useMemo(() => (plan ? computeMetrics(ledger, plan, data.settings) : null), [ledger, plan, data.settings]);
}

/** Scenario date after events 1..step (date events only), available instantly without solving. */
export function dateAtStep(data: Dataset, step: number): string {
  let d = data.settings.scenarioDate;
  for (const e of data.events.slice(0, step)) if (e.type === "date_advanced" && e.newDate > d) d = e.newDate;
  return d;
}
