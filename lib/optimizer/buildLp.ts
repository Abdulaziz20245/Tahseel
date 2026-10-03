// CPLEX LP model for HiGHS — Claude.md §7.4. Names are short, index-based and built in sorted
// order (invoices and companies by id, days ascending) so the same ledger always yields the same text.

import type { CompanyId } from "../types";
import { daysInWindow, weekOf, type WindowResult } from "./windows";

export type Pass = 0 | 1 | 2;
export interface PassBounds {
  slack?: number; // pass 0 optimum
  payments?: number; // pass 1 optimum
}

/** Tolerance when pass 0's optimum becomes a constraint: one halala, so a cap is never silently exceeded. */
export const SLACK_TOLERANCE = 0.01;

export type VarInfo =
  | { kind: "x"; invoiceId: string; day: string }
  | { kind: "in" | "out" | "yi" | "yo"; companyId: CompanyId; day: string }
  | { kind: "s"; companyId: CompanyId; week: number };

export interface LpModel {
  varMap: Map<string, VarInfo>; // LP variable name → meaning
  counts: { continuous: number; binary: number; constraints: number };
  hasCaps: boolean;
  /** LP text for a pass; `bounds` carries the optima of earlier passes. */
  lpText: (pass: Pass, bounds?: PassBounds) => string;
  invoiceIds: string[]; // index → id
  companyIds: CompanyId[]; // index → id
  days: string[]; // index → day
}

type Term = [coef: number, name: string];

/** Number formatting the LP reader accepts: no exponent for ordinary values, full precision. */
function n(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Number(v.toPrecision(15)).toString();
}

function expr(terms: Term[]): string {
  const parts = terms.map(([c, name], i) => {
    const sign = c < 0 ? "-" : i === 0 ? "" : "+";
    const abs = Math.abs(c);
    return `${sign} ${abs === 1 ? "" : n(abs) + " "}${name}`.trim();
  });
  // Keep lines short: the LP format does not require it, but long lines are hard to read in the viewer.
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 8) lines.push(parts.slice(i, i + 8).join(" "));
  return lines.join("\n    ");
}

export function buildLp(wr: WindowResult, scenarioDate: string): LpModel {
  const { windows, days, caps } = wr;
  const invoiceIds = windows.map((w) => w.invoiceId); // already sorted by id
  const companyIds = [...new Set(windows.flatMap((w) => [w.payerId, w.payeeId]))].sort();
  const ci = new Map(companyIds.map((c, i) => [c, i]));
  const di = new Map(days.map((d, i) => [d, i]));

  const varMap = new Map<string, VarInfo>();
  const rows: string[] = [];
  const binaries: string[] = [];

  // x_i_d and the per company/day lists of settled terms.
  const xByInvoice: string[][] = [];
  const receivable = new Map<string, Term[]>(); // key c|d
  const payable = new Map<string, Term[]>();
  const payCap = new Map<string, number>(); // tight big-M per company/day for pay-ins
  const recvCap = new Map<string, number>(); // ... and for pay-outs
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);

  windows.forEach((w, i) => {
    const names: string[] = [];
    for (const d of daysInWindow(w, days)) {
      const name = `x_${i}_${di.get(d)}`;
      varMap.set(name, { kind: "x", invoiceId: w.invoiceId, day: d });
      names.push(name);
      push(receivable, `${w.payeeId}|${d}`, [1, name] as Term);
      push(payable, `${w.payerId}|${d}`, [1, name] as Term);
      payCap.set(`${w.payerId}|${d}`, (payCap.get(`${w.payerId}|${d}`) ?? 0) + w.amount);
      recvCap.set(`${w.payeeId}|${d}`, (recvCap.get(`${w.payeeId}|${d}`) ?? 0) + w.amount);
    }
    xByInvoice.push(names);
    // 1. Fully settled
    rows.push(` settle_${i}: ${expr(names.map((nm) => [1, nm] as Term))} = ${n(w.amount)}`);
  });

  // Company/day pairs that have any settlement variable.
  const pairs = [...new Set([...receivable.keys(), ...payable.keys()])]
    .map((k) => {
      const [c, d] = k.split("|");
      return { c, d, ck: ci.get(c)!, dk: di.get(d)! };
    })
    .sort((a, b) => a.dk - b.dk || a.ck - b.ck);

  const inTerms: Term[] = [];
  const yTerms: Term[] = [];
  const inByDay = new Map<string, Term[]>(); // key: day index
  const outByDay = new Map<string, Term[]>();
  const inByCompanyWeek = new Map<string, Term[]>();

  for (const { c, d, ck, dk } of pairs) {
    const key = `${c}|${d}`;
    const inV = `in_${ck}_${dk}`;
    const outV = `out_${ck}_${dk}`;
    const yiV = `yi_${ck}_${dk}`;
    const yoV = `yo_${ck}_${dk}`;
    varMap.set(inV, { kind: "in", companyId: c, day: d });
    varMap.set(outV, { kind: "out", companyId: c, day: d });
    varMap.set(yiV, { kind: "yi", companyId: c, day: d });
    varMap.set(yoV, { kind: "yo", companyId: c, day: d });
    binaries.push(yiV, yoV);
    inTerms.push([1, inV]);
    yTerms.push([1, yiV], [1, yoV]);
    push(inByDay, String(dk), [1, inV] as Term);
    push(outByDay, String(dk), [1, outV] as Term);

    // 2. Company balance: receivable − payable = out − in
    const bal: Term[] = [
      ...(receivable.get(key) ?? []),
      ...(payable.get(key) ?? []).map(([, nm]) => [-1, nm] as Term),
      [-1, outV],
      [1, inV],
    ];
    rows.push(` bal_${ck}_${dk}: ${expr(bal)} = 0`);
    // 3. Link amounts to payments. M is the most the company could pay (or receive) that day.
    rows.push(` lin_${ck}_${dk}: ${inV} - ${n(Math.max(payCap.get(key) ?? 0, 0))} ${yiV} <= 0`);
    rows.push(` lout_${ck}_${dk}: ${outV} - ${n(Math.max(recvCap.get(key) ?? 0, 0))} ${yoV} <= 0`);
    rows.push(` one_${ck}_${dk}: ${yiV} + ${yoV} <= 1`);

    if (caps.has(c)) push(inByCompanyWeek, `${ck}|${weekOf(d, scenarioDate)}`, [1, inV] as Term);
  }

  // 4. Weekly caps, with break slack s_c_w
  const sTerms: Term[] = [];
  for (const [k, terms] of [...inByCompanyWeek].sort()) {
    const [ck, w] = k.split("|").map(Number);
    const sV = `s_${ck}_${w}`;
    varMap.set(sV, { kind: "s", companyId: companyIds[ck], week: w });
    sTerms.push([1, sV]);
    rows.push(` cap_${ck}_${w}: ${expr([...terms, [-1, sV]])} <= ${n(caps.get(companyIds[ck])!)}`);
  }

  // 5. Hub pays out only what it receives, per day
  for (const dk of [...inByDay.keys()].map(Number).sort((a, b) => a - b)) {
    const terms = [...(inByDay.get(String(dk)) ?? []), ...(outByDay.get(String(dk)) ?? []).map(([, nm]) => [-1, nm] as Term)];
    rows.push(` hub_${dk}: ${expr(terms)} = 0`);
  }

  // Pass 2 cost: cash only. The "later rounds" tie-break is applied after solving (shiftRoundsLater in
  // solve.ts); folding it into pass 2 as ε·rank made the proof stall at the halala level.
  const cashTerms: Term[] = inTerms;

  const continuous = [...varMap.values()].filter((v) => v.kind !== "yi" && v.kind !== "yo").length;
  const counts = { continuous, binary: binaries.length, constraints: rows.length };

  // Valid inequalities. They hold in every feasible plan, so the optimum is unchanged; they only give
  // HiGHS a strong lower bound on the payment count (without them, proving optimality takes ~1 min).
  // A net payer pays the hub at least once, a net receiver is paid at least once, and a company with
  // a weekly cap pays in at least ⌈(net payable − allowed slack) ÷ cap⌉ separate times.
  const net = new Map<CompanyId, number>();
  for (const w of windows) {
    net.set(w.payeeId, (net.get(w.payeeId) ?? 0) + w.amount);
    net.set(w.payerId, (net.get(w.payerId) ?? 0) - w.amount);
  }
  const legTerms = (c: CompanyId, kind: "yi" | "yo"): Term[] =>
    pairs.filter((p) => p.c === c).map((p) => [1, `${kind}_${p.ck}_${p.dk}`] as Term);
  // Cash: every net payer pays at least its net position into the hub, so Σ pay-ins ≥ Σ net payables.
  const minCash = [...net.values()].filter((v) => v < 0).reduce((s, v) => s - v, 0);
  const validCuts = (slackBound: number | undefined): string[] => [
    ...(inTerms.length ? [` need_cash: ${expr(inTerms)} >= ${n(Math.round(minCash * 100) / 100 - 0.01)}`] : []),
    ...companyIds.flatMap((c, ck) => {
      const v = net.get(c) ?? 0;
      if (v > 0.005) return [` need_out_${ck}: ${expr(legTerms(c, "yo"))} >= 1`];
      if (v < -0.005) {
        const cap = caps.get(c);
        const k = cap && slackBound !== undefined ? Math.max(1, Math.ceil((-v - slackBound - 0.005) / cap)) : 1;
        return [` need_in_${ck}: ${expr(legTerms(c, "yi"))} >= ${k}`];
      }
      return [];
    }),
  ];

  const lpText: LpModel["lpText"] = (pass, bounds = {}) => {
    const objective = [sTerms, yTerms, cashTerms][pass];
    const slackBound = bounds.slack !== undefined ? bounds.slack + SLACK_TOLERANCE : undefined;
    const extra: string[] = validCuts(pass >= 1 ? slackBound : undefined);
    if (pass >= 1 && sTerms.length && slackBound !== undefined) extra.push(` pass0_slack: ${expr(sTerms)} <= ${n(slackBound)}`);
    if (pass >= 2 && bounds.payments !== undefined) extra.push(` pass1_payments: ${expr(yTerms)} <= ${n(bounds.payments)}`);
    const name = ["breaks", "payments", "cash"][pass];
    return [
      `\\ Tahseel settlement model, pass ${pass} (minimise ${name})`,
      "Minimize",
      ` obj_${name}: ${objective.length ? expr(objective) : "0 " + (inTerms[0]?.[1] ?? "x_0_0")}`,
      "Subject To",
      ...rows,
      ...extra,
      "Binary",
      ...(binaries.length ? [" " + binaries.join(" ")] : []),
      "End",
      "",
    ].join("\n");
  };

  return { varMap, counts, hasCaps: sTerms.length > 0, lpText, invoiceIds, companyIds, days };
}
