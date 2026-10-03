// Fallback when WebAssembly cannot load — Claude.md §7.8. Interval stabbing gives the fewest
// rounds; it does not prove the fewest payments or least cash, and ignores weekly caps (flagged).

import type { Ledger, Plan } from "../types";
import { capBreaks, emptyPlan, roundsFromSettlements } from "./solve";
import { validatePlan } from "./validate";
import { computeWindows, daysInWindow } from "./windows";

export function heuristicPlan(ledger: Ledger, maxPaymentDays: number, anchor: string): Plan {
  const wr = computeWindows(ledger, maxPaymentDays, anchor);
  if (wr.windows.length === 0) return { ...emptyPlan(wr), method: "heuristic" };

  // Greedy stabbing: sorted by latest, pick the window's last round day whenever it is not yet hit.
  const picked: string[] = [];
  for (const w of [...wr.windows].sort((a, b) => a.latest.localeCompare(b.latest) || a.invoiceId.localeCompare(b.invoiceId))) {
    if (!picked.some((d) => d >= w.earliest && d <= w.latest)) picked.push(daysInWindow(w, wr.days).at(-1)!);
  }

  // Each invoice settles in full on the latest picked day inside its window.
  const amounts = new Map<string, Map<string, number>>();
  for (const w of wr.windows) {
    const day = picked.filter((d) => d >= w.earliest && d <= w.latest).sort().at(-1)!;
    amounts.set(w.invoiceId, new Map([[day, w.amount]]));
  }
  const rounds = roundsFromSettlements(amounts, wr);
  const plan: Plan = {
    rounds,
    breaks: [...wr.breaks, ...capBreaks(rounds, wr, ledger.date)],
    stats: [],
    checks: [],
    method: "heuristic",
    windows: wr.windows,
    days: [...picked].sort(),
    overdue: wr.overdue,
  };
  plan.checks = validatePlan(plan, ledger, maxPaymentDays);
  return plan;
}
