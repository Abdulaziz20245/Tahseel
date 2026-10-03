// Replay + solve for one step (Claude.md §9.3). Shared by the Web Worker, the main-thread fallback,
// scripts and tests. Plans are cached by ledger state, so a step whose data did not change (for
// example a confirmation) reuses the previous plan instead of re-solving.

import { applyEvents, companySchedule, isOpen, type EventResult } from "../ledger";
import type { CompanyId, Dataset, Ledger, Plan } from "../types";
import { heuristicPlan } from "./heuristic";
import { solvePlan, type HighsLike } from "./solve";

export interface StepResult {
  step: number;
  ledger: Ledger;
  plan: Plan;
  previousPlan: Plan | null; // plan at step − 1
  eventResults: EventResult[];
  solveMs: number; // wall time spent solving for this request (0 when fully cached)
  changedAt: Record<CompanyId, number>; // last step at which each company's proposal changed (0 = never)
}

/**
 * For each company, the last step whose plan gave it a different schedule than the step before.
 * Rounds already executed by then are ignored: executing a round is not a change to the proposal.
 */
export function lastChangedSteps(data: Dataset, ledger: Ledger, plans: (Plan | null)[]): Record<CompanyId, number> {
  const out: Record<CompanyId, number> = {};
  for (const c of data.companies) {
    out[c.id] = 0;
    for (let j = 1; j < plans.length; j++) {
      const executed = new Set(ledger.executedRounds.filter((r) => r.step <= j).map((r) => r.date));
      if (companySchedule(plans[j] ?? null, c.id, executed) !== companySchedule(plans[j - 1] ?? null, c.id, executed)) out[c.id] = j;
    }
  }
  return out;
}

export interface Engine {
  compute(step: number): StepResult;
  readonly method: "mip" | "heuristic";
}

/** Everything the optimiser reads from a ledger; equal keys ⇒ equal plans. */
function solveKey(ledger: Ledger): string {
  return JSON.stringify([
    ledger.date,
    ledger.invoices.filter(isOpen).map((i) => [i.id, i.remaining, i.issueDate, i.dueDate, i.buyerId, i.sellerId]),
    ledger.constraints,
  ]);
}

export function createEngine(data: Dataset, highs: HighsLike | null): Engine {
  const plansByKey = new Map<string, Plan>();
  const steps = new Map<number, StepResult>();
  const max = data.settings.maxPaymentDays;
  const anchor = data.settings.scenarioDate; // weekly round calendar starts here
  let solveMs = 0;

  const planAt = (ledger: Ledger): Plan => {
    const key = solveKey(ledger);
    let plan = plansByKey.get(key);
    if (!plan) {
      const t0 = performance.now();
      plan = highs ? solvePlan(ledger, highs, max, anchor) : heuristicPlan(ledger, max, anchor);
      solveMs += performance.now() - t0;
      plansByKey.set(key, plan);
    }
    return plan;
  };

  return {
    method: highs ? "mip" : "heuristic",
    compute(step) {
      const cached = steps.get(step);
      if (cached) return { ...cached, solveMs: 0 };
      solveMs = 0;
      const { ledger, eventResults, plans } = applyEvents(data, data.events, step, { planAt });
      const result: StepResult = {
        step,
        ledger,
        plan: plans[step]!,
        previousPlan: step > 0 ? plans[step - 1] ?? null : null,
        eventResults,
        solveMs,
        changedAt: lastChangedSteps(data, ledger, plans),
      };
      steps.set(step, result);
      return result;
    },
  };
}
