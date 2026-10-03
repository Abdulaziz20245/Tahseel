// Independent correctness checks run after every solve — Claude.md §7.9.

import { addDays } from "../dates";
import { sar } from "../format";
import { CAP_TOLERANCE } from "./windows";
import type { CheckResult, Ledger, Plan } from "../types";

const TOL = 0.011; // 0.01 SAR, plus floating-point slack

export function validatePlan(plan: Plan, ledger: Ledger, maxPaymentDays: number): CheckResult[] {
  const win = new Map(plan.windows.map((w) => [w.invoiceId, w]));
  const results: CheckResult[] = [];
  const check = (id: number, label: string, problems: string[]) =>
    results.push({ id, label, ok: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join("; ") + (problems.length > 3 ? ` (+${problems.length - 3} more)` : "") : undefined });

  // 1. Every open invoice fully settled
  {
    const settled = new Map<string, number>();
    for (const r of plan.rounds) for (const s of r.settlements) settled.set(s.invoiceId, (settled.get(s.invoiceId) ?? 0) + s.amount);
    const p: string[] = [];
    for (const w of plan.windows) {
      const got = settled.get(w.invoiceId) ?? 0;
      if (Math.abs(got - w.amount) > TOL) p.push(`${w.invoiceId}: ${sar(got)} of ${sar(w.amount)}`);
    }
    for (const id of settled.keys()) if (!win.has(id)) p.push(`${id} settled but not open`);
    check(1, "Every open invoice is settled in full (±0.01 SAR)", p);
  }

  // 2. Settlement days inside windows
  {
    const p: string[] = [];
    for (const r of plan.rounds)
      for (const s of r.settlements) {
        const w = win.get(s.invoiceId);
        if (w && (r.date < w.earliest || r.date > w.latest)) p.push(`${s.invoiceId} on ${r.date}, window ${w.earliest}…${w.latest}`);
      }
    check(2, "Every settlement falls inside its invoice's window", p);
  }

  // 3. Hub balanced per day; nobody both pays and receives on one day
  {
    const p: string[] = [];
    for (const r of plan.rounds) {
      const pin = r.legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0);
      const pout = r.legs.filter((l) => l.dir === "out").reduce((s, l) => s + l.amount, 0);
      if (Math.abs(pin - pout) > TOL) p.push(`${r.date}: in ${sar(pin)} ≠ out ${sar(pout)}`);
      const seen = new Set<string>();
      for (const l of r.legs) {
        if (seen.has(l.companyId)) p.push(`${l.companyId} has two legs on ${r.date}`);
        seen.add(l.companyId);
      }
    }
    check(3, "Each day, pay-ins equal pay-outs and no company both pays and receives", p);
  }

  // 4. Per company per day: pay-out − pay-in = receivable − payable settled
  {
    const p: string[] = [];
    for (const r of plan.rounds) {
      const net = new Map<string, number>();
      for (const s of r.settlements) {
        const w = win.get(s.invoiceId);
        if (!w) continue;
        net.set(w.payeeId, (net.get(w.payeeId) ?? 0) + s.amount);
        net.set(w.payerId, (net.get(w.payerId) ?? 0) - s.amount);
      }
      const legNet = new Map<string, number>();
      for (const l of r.legs) legNet.set(l.companyId, (l.dir === "out" ? 1 : -1) * l.amount);
      for (const c of new Set([...net.keys(), ...legNet.keys()]))
        if (Math.abs((net.get(c) ?? 0) - (legNet.get(c) ?? 0)) > TOL) p.push(`${c} on ${r.date}`);
    }
    check(4, "Each company's hub transfer equals what it is owed minus what it owes that day", p);
  }

  // 5. Overall net per company equals its ledger net position
  {
    const ledgerNet = new Map<string, number>();
    for (const w of plan.windows) {
      ledgerNet.set(w.payeeId, (ledgerNet.get(w.payeeId) ?? 0) + w.amount);
      ledgerNet.set(w.payerId, (ledgerNet.get(w.payerId) ?? 0) - w.amount);
    }
    const planNet = new Map<string, number>();
    for (const r of plan.rounds) for (const l of r.legs) planNet.set(l.companyId, (planNet.get(l.companyId) ?? 0) + (l.dir === "out" ? 1 : -1) * l.amount);
    const p: string[] = [];
    for (const c of new Set([...ledgerNet.keys(), ...planNet.keys()]))
      if (Math.abs((ledgerNet.get(c) ?? 0) - (planNet.get(c) ?? 0)) > TOL) p.push(`${c}: plan ${sar(planNet.get(c) ?? 0)} vs ledger ${sar(ledgerNet.get(c) ?? 0)}`);
    check(5, "Each company's total received minus paid equals its net position in the ledger", p);
  }

  // 6. Weekly caps respected, or the excess is listed as a constraint break
  {
    const p: string[] = [];
    for (const c of ledger.constraints) {
      if (c.kind !== "weeklyCap" || c.amount === undefined) continue;
      const perWeek = new Map<number, number>();
      for (const r of plan.rounds) {
        const leg = r.legs.find((l) => l.companyId === c.companyId && l.dir === "in");
        if (leg) {
          const w = Math.floor((Date.parse(r.date) - Date.parse(ledger.date)) / 864e5 / 7);
          perWeek.set(w, (perWeek.get(w) ?? 0) + leg.amount);
        }
      }
      const excessWeeks = [...perWeek.values()].filter((v) => v > c.amount! + CAP_TOLERANCE).length;
      const listed = plan.breaks.filter((b) => b.kind === "weeklyCap" && b.companyId === c.companyId).length;
      if (excessWeeks !== listed) p.push(`${c.companyId}: ${excessWeeks} week(s) over cap, ${listed} break(s) listed`);
    }
    check(6, "Weekly caps are respected, or every excess is listed as a constraint break", p);
  }

  // 7. Nothing settles after issue + max period
  {
    const p: string[] = [];
    for (const r of plan.rounds)
      for (const s of r.settlements) {
        const w = win.get(s.invoiceId);
        if (w && r.date > addDays(w.issueDate, maxPaymentDays)) p.push(`${s.invoiceId} on ${r.date}`);
      }
    check(7, `No settlement later than issue date + ${maxPaymentDays} days`, p);
  }

  return results;
}
