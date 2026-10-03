// Lexicographic MIP — Claude.md §7.4–7.5 as amended in P04 (weekly rounds, halala gap, tie-break
// after solving). Synchronous once HiGHS is loaded.

import type { ConstraintBreak, Ledger, Leg, PassStat, Plan, Round } from "../types";
import { addDays } from "../dates";
import { sar } from "../format";
import { buildLp, type LpModel, type Pass, type PassBounds } from "./buildLp";
import { validatePlan } from "./validate";
import { CAP_TOLERANCE, computeWindows, weekOf, type WindowResult } from "./windows";

/** The subset of the highs-js API we use (the legacy one-shot solve). */
export interface HighsLike {
  solve(
    lp: string,
    options?: Record<string, unknown>,
  ): { Status: string; ObjectiveValue: number; Columns: Record<string, unknown> };
}

/** Primal value of a column (0 when absent, e.g. on an infeasible result). */
function primal(columns: Record<string, unknown>, name: string): number {
  const col = columns[name] as { Primal?: number } | undefined;
  return col?.Primal ?? 0;
}

// mip_abs_gap: optimality is proven to the halala. With only mip_rel_gap 0, HiGHS keeps its default
// absolute gap of 1e-6, which on totals of ~SAR 15m is below floating-point precision and never closes.
export const SOLVER_OPTIONS = { output_flag: false, time_limit: 5, mip_rel_gap: 0, mip_abs_gap: 0.01 } as const;

export const PASS_OBJECTIVES = [
  "Least constraint breaking (Σ cap excess)",
  "Fewest payments (Σ hub transfers)",
  "Least cash moved (Σ pay-ins)",
] as const;

const OK_STATUSES = new Set(["Optimal"]);

export function emptyPlan(wr?: WindowResult): Plan {
  return {
    rounds: [],
    breaks: wr?.breaks ?? [],
    stats: [],
    checks: [],
    method: "none",
    windows: [],
    days: [],
    overdue: wr?.overdue ?? [],
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

type Amounts = Map<string, Map<string, number>>; // invoice → day → SAR

/**
 * Turns per-invoice/day settlement amounts into rounds. Amounts are rounded to the halala with the
 * remainder on each invoice's largest settlement, and hub legs are derived from those rounded
 * amounts, so every balance in the plan is exact.
 */
export function roundsFromSettlements(amounts: Amounts, wr: WindowResult): Round[] {
  const byDay = new Map<string, { invoiceId: string; amount: number }[]>();
  for (const w of wr.windows) {
    const perDay = [...(amounts.get(w.invoiceId) ?? new Map<string, number>())]
      .map(([day, v]) => ({ day, amount: r2(v) }))
      .filter((s) => s.amount > 0);
    if (perDay.length === 0) continue;
    const diff = r2(w.amount - perDay.reduce((s, x) => s + x.amount, 0));
    if (diff !== 0) {
      const largest = perDay.reduce((a, b) => (b.amount > a.amount ? b : a));
      largest.amount = r2(largest.amount + diff);
    }
    for (const s of perDay) if (s.amount > 0) byDay.set(s.day, [...(byDay.get(s.day) ?? []), { invoiceId: w.invoiceId, amount: s.amount }]);
  }

  const win = new Map(wr.windows.map((w) => [w.invoiceId, w]));
  return [...byDay.keys()].sort().map((date) => {
    const settlements = byDay.get(date)!.sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    const net = new Map<string, number>(); // + receives, − pays
    for (const s of settlements) {
      const w = win.get(s.invoiceId)!;
      net.set(w.payeeId, r2((net.get(w.payeeId) ?? 0) + s.amount));
      net.set(w.payerId, r2((net.get(w.payerId) ?? 0) - s.amount));
    }
    const legs: Leg[] = [...net]
      .filter(([, v]) => Math.abs(v) >= 0.005)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([companyId, v]) => ({ companyId, dir: v < 0 ? "in" : "out", amount: Math.abs(v) }));
    return { date, settlements, legs };
  });
}

/** Weekly-cap pay-ins per company and week. */
function capUse(rounds: Round[], wr: WindowResult, scenarioDate: string): Map<string, number> {
  const use = new Map<string, number>();
  for (const r of rounds)
    for (const l of r.legs)
      if (l.dir === "in" && wr.caps.has(l.companyId)) {
        const k = `${l.companyId}|${weekOf(r.date, scenarioDate)}`;
        use.set(k, (use.get(k) ?? 0) + l.amount);
      }
  return use;
}

/** Weekly-cap excess in a set of rounds, reported as constraint breaks. */
export function capBreaks(rounds: Round[], wr: WindowResult, scenarioDate: string): ConstraintBreak[] {
  const out: ConstraintBreak[] = [];
  for (const [k, paid] of [...capUse(rounds, wr, scenarioDate)].sort()) {
    const [companyId, w] = k.split("|");
    const cap = wr.caps.get(companyId)!;
    if (paid > cap + CAP_TOLERANCE)
      out.push({
        companyId,
        kind: "weeklyCap",
        amount: r2(paid - cap),
        reason: `Weekly cap of ${sar(cap)} exceeded by ${sar(r2(paid - cap))} in the week starting ${addDays(scenarioDate, Number(w) * 7)}: the invoices due that week cannot be covered otherwise.`,
      });
  }
  return out;
}

const legCount = (rounds: Round[]) => rounds.reduce((s, r) => s + r.legs.length, 0);
const cashOf = (rounds: Round[]) => r2(rounds.flatMap((r) => r.legs).filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0));

/**
 * Tie-break "later rounds" (payers never pay earlier than needed). Works on the pass-2 optimum:
 * each round, latest first, moves as a whole to the latest round day that all its invoices' windows
 * allow, merging with any round already there. A move is kept only if payments and cash are
 * unchanged (merging can never increase them, and they are already optimal) and no weekly cap gets
 * worse, so the proven optima of passes 0–2 are preserved.
 */
export function shiftRoundsLater(amounts: Amounts, wr: WindowResult, scenarioDate: string): Round[] {
  const win = new Map(wr.windows.map((w) => [w.invoiceId, w]));
  let rounds = roundsFromSettlements(amounts, wr);
  const targetPayments = legCount(rounds);
  const targetCash = cashOf(rounds);

  const capOk = (next: Round[], prev: Round[]) => {
    const before = capUse(prev, wr, scenarioDate);
    for (const [k, v] of capUse(next, wr, scenarioDate)) {
      const cap = wr.caps.get(k.split("|")[0])!;
      if (v > cap + CAP_TOLERANCE && v > (before.get(k) ?? 0) + CAP_TOLERANCE) return false;
    }
    return true;
  };

  for (const date of rounds.map((r) => r.date).sort().reverse()) {
    const round = rounds.find((r) => r.date === date);
    if (!round) continue;
    const candidates = wr.days
      .filter((d) => d > date && round.settlements.every((s) => d >= win.get(s.invoiceId)!.earliest && d <= win.get(s.invoiceId)!.latest))
      .reverse();
    for (const target of candidates) {
      const moved: Amounts = new Map([...amounts].map(([id, m]) => [id, new Map(m)]));
      for (const s of round.settlements) {
        const m = moved.get(s.invoiceId)!;
        m.set(target, (m.get(target) ?? 0) + (m.get(date) ?? 0));
        m.delete(date);
      }
      const next = roundsFromSettlements(moved, wr);
      if (legCount(next) === targetPayments && Math.abs(cashOf(next) - targetCash) < 0.015 && capOk(next, rounds)) {
        amounts = moved;
        rounds = next;
        break;
      }
    }
  }
  return rounds;
}

export function solvePlan(ledger: Ledger, highs: HighsLike, maxPaymentDays: number, anchor: string): Plan {
  const wr = computeWindows(ledger, maxPaymentDays, anchor);
  if (wr.windows.length === 0) return emptyPlan(wr);

  const model: LpModel = buildLp(wr, ledger.date);
  const stats: PassStat[] = [];
  const run = (pass: Pass, bounds: PassBounds) => {
    const lp = model.lpText(pass, bounds);
    const t0 = performance.now();
    const res = highs.solve(lp, SOLVER_OPTIONS);
    const timeMs = performance.now() - t0;
    stats.push({
      pass,
      objective: PASS_OBJECTIVES[pass],
      status: res.Status,
      value: res.ObjectiveValue,
      timeMs,
      variables: model.counts.continuous + model.counts.binary,
      binaries: model.counts.binary,
      constraints: lp.split("\n").filter((l) => /^ \w+:/.test(l)).length - 1, // rows minus the objective
    });
    return res;
  };

  const fail = (why: string): Plan => ({ ...emptyPlan(wr), method: "mip", stats, windows: wr.windows, days: wr.days, error: why });

  let slack = 0;
  if (model.hasCaps) {
    const r0 = run(0, {});
    if (!OK_STATUSES.has(r0.Status)) return fail(`Pass 0 ended with status "${r0.Status}".`);
    slack = Math.max(0, r0.ObjectiveValue);
  }
  const r1 = run(1, { slack });
  if (!OK_STATUSES.has(r1.Status)) return fail(`Pass 1 ended with status "${r1.Status}".`);
  const payments = Math.round(r1.ObjectiveValue);
  const r2res = run(2, { slack, payments });
  if (!OK_STATUSES.has(r2res.Status)) return fail(`Pass 2 ended with status "${r2res.Status}".`);

  const amounts: Amounts = new Map();
  for (const [name, info] of model.varMap) {
    if (info.kind !== "x") continue;
    const v = primal(r2res.Columns, name);
    if (v <= 0.000001) continue;
    if (!amounts.has(info.invoiceId)) amounts.set(info.invoiceId, new Map());
    amounts.get(info.invoiceId)!.set(info.day, v);
  }
  const rounds = shiftRoundsLater(amounts, wr, ledger.date);
  const plan: Plan = {
    rounds,
    breaks: [...wr.breaks, ...capBreaks(rounds, wr, ledger.date)],
    stats,
    checks: [],
    method: "mip",
    windows: wr.windows,
    days: wr.days,
    overdue: wr.overdue,
  };
  plan.checks = validatePlan(plan, ledger, maxPaymentDays);
  return plan;
}
