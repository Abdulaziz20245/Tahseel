// Before/after metrics — Claude.md §6. The single source for the Network counters, the Government
// tab and the assistant snapshot. "Before" and "after" always use the same set of invoices: the open
// ones the plan settles (held, escalated and overdue invoices are excluded and counted separately).

import { addDays, toDayNumber } from "./dates";
import { isOpen } from "./ledger";
import type { CompanyId, Escalation, Ledger, LedgerInvoice, MetricPair, Plan, Settings } from "./types";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Open invoices in scope for both baseline and plan at this step. */
export function scopeInvoices(ledger: Ledger, plan: Plan | null): LedgerInvoice[] {
  const open = ledger.invoices.filter(isOpen);
  if (!plan) return open;
  const ids = new Set(plan.windows.map((w) => w.invoiceId));
  return open.filter((i) => ids.has(i.id));
}

// ---------- Rows ----------

export type MetricKey =
  | "payments"
  | "cash"
  | "setOff"
  | "theoreticalShare"
  | "overdue"
  | "escalated"
  | "peakFinancing"
  | "financingCost";

export interface MetricRow extends MetricPair {
  key: MetricKey;
  label: string;
  unit: "count" | "SAR" | "%";
  better: "lower" | "higher";
  /** For "%" rows, null when undefined (no baseline); never NaN or ∞. */
  beforeValue: number | null;
  afterValue: number | null;
  illustrative?: string; // label shown on illustrative metrics
  secondary?: { before: number; after: number; unit: "SAR" }; // e.g. SAR of overdue invoices
  note?: string;
}

export interface RoundSummary {
  date: string;
  invoices: number;
  gross: number; // Σ invoice amounts settled that round
  setOff: number; // gross − hub cash
  hubCash: number; // Σ pay-ins (= Σ pay-outs)
  payments: number; // hub legs
}

export interface OverdueItem {
  invoiceId: string;
  payerId: CompanyId;
  payeeId: CompanyId;
  amount: number;
  issueDate: string;
  status: LedgerInvoice["derivedStatus"];
  escalation?: Escalation;
}

export interface Metrics {
  rows: Record<MetricKey, MetricRow>;
  order: MetricKey[];
  planAvailable: boolean; // false → "after" shows the baseline (no valid plan)
  cashBefore: number;
  cashAfter: number;
  minCash: number; // Σ positive net positions: cash if everything settled on one day
  rounds: RoundSummary[];
  overdue: OverdueItem[];
  escalations: Escalation[];
}

export const FINANCING_LABEL = "Illustrative — assumed 8% rate, zero starting cash";

// ---------- Change helper ----------

export interface Change {
  abs: number;
  pct: number | null; // null when before = 0 (no baseline)
  direction: "better" | "worse" | "equal";
}

export function change(row: Pick<MetricRow, "before" | "after" | "better">): Change {
  const abs = round2(row.after - row.before);
  const pct = row.before === 0 ? null : (row.after - row.before) / row.before;
  const eq = Math.abs(abs) < 0.005;
  const improved = row.better === "lower" ? abs < 0 : abs > 0;
  return { abs, pct, direction: eq ? "equal" : improved ? "better" : "worse" };
}

/** (after − before) ÷ before for a plain pair, or null when there is no baseline. */
export function pctChange(m: MetricPair): number | null {
  return m.before === 0 ? null : (m.after - m.before) / m.before;
}

// ---------- Financing walk ----------

export interface Flow {
  companyId: CompanyId;
  date: string;
  amount: number; // + received, − paid
}

/**
 * Daily walk per company (§6): cumulative cash = receipts − payments so far, starting at zero spare
 * cash [Illustrative]. Shortfall on a day = max(0, −cumulative at the end of that day). Need = the
 * largest shortfall; cost = Σ days of shortfall × rate ÷ 365. Days run from `from` to `to` inclusive,
 * the same horizon for "before" and "after" so they are comparable.
 */
export function financingWalk(flows: Flow[], from: string, to: string, rate: number): { need: number; cost: number; perCompany: Map<CompanyId, { need: number; cost: number }> } {
  const byCompany = new Map<CompanyId, Map<number, number>>();
  for (const f of flows) {
    const m = byCompany.get(f.companyId) ?? new Map<number, number>();
    const d = Math.max(toDayNumber(f.date), toDayNumber(from)); // past-due flows happen on the first day
    m.set(d, (m.get(d) ?? 0) + f.amount);
    byCompany.set(f.companyId, m);
  }
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  const perCompany = new Map<CompanyId, { need: number; cost: number }>();
  let need = 0;
  let cost = 0;
  for (const [c, m] of byCompany) {
    let cum = 0;
    let cNeed = 0;
    let cCost = 0;
    for (let d = start; d <= end; d++) {
      cum += m.get(d) ?? 0;
      const shortfall = Math.max(0, -cum);
      cNeed = Math.max(cNeed, shortfall);
      cCost += (shortfall * rate) / 365;
    }
    perCompany.set(c, { need: round2(cNeed), cost: round2(cCost) });
    need += cNeed;
    cost += cCost;
  }
  return { need: round2(need), cost: round2(cost), perCompany };
}

// ---------- Compute ----------

export function computeMetrics(ledger: Ledger, plan: Plan | null, settings: Settings): Metrics {
  const T = ledger.date;
  const valid = plan !== null && !plan.error && plan.checks.every((c) => c.ok);
  const scope = scopeInvoices(ledger, plan);

  const paymentsBefore = scope.length;
  const cashBefore = round2(scope.reduce((s, i) => s + i.remaining, 0));
  const legs = valid ? plan.rounds.flatMap((r) => r.legs) : [];
  const paymentsAfter = valid ? legs.length : paymentsBefore;
  const cashAfter = valid ? round2(legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0)) : cashBefore;

  // Most set-off possible: everything on one day, so only overall net positions move.
  const net = new Map<CompanyId, number>();
  for (const i of scope) {
    net.set(i.sellerId, (net.get(i.sellerId) ?? 0) + i.remaining);
    net.set(i.buyerId, (net.get(i.buyerId) ?? 0) - i.remaining);
  }
  const minCash = round2([...net.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0));

  const setOffAfter = cashBefore === 0 ? null : 1 - cashAfter / cashBefore;
  const maxSetOff = cashBefore - minCash;
  const shareAfter = cashBefore === 0 || maxSetOff <= 0.005 ? null : Math.min(1, (cashBefore - cashAfter) / maxSetOff);

  // Past the maximum period: open, held or escalated invoices with issue + max < scenario date.
  const overdue: OverdueItem[] = ledger.invoices
    .filter((i) => (isOpen(i) || i.derivedStatus === "held" || i.derivedStatus === "escalated") && addDays(i.issueDate, settings.maxPaymentDays) < T)
    .map((i) => ({
      invoiceId: i.id,
      payerId: i.buyerId,
      payeeId: i.sellerId,
      amount: i.remaining,
      issueDate: i.issueDate,
      status: i.derivedStatus,
      escalation: ledger.escalations.find((e) => e.invoiceId === i.id),
    }));
  const overdueSar = round2(overdue.reduce((s, o) => s + o.amount, 0));

  // Financing walk: before = each invoice on its due date (or today if past due); after = hub legs.
  const beforeFlows: Flow[] = scope.flatMap((i) => {
    const d = i.dueDate > T ? i.dueDate : T;
    return [
      { companyId: i.buyerId, date: d, amount: -i.remaining },
      { companyId: i.sellerId, date: d, amount: i.remaining },
    ];
  });
  const afterFlows: Flow[] = valid
    ? plan.rounds.flatMap((r) => r.legs.map((l) => ({ companyId: l.companyId, date: r.date, amount: l.dir === "in" ? -l.amount : l.amount })))
    : beforeFlows;
  const lastDay = [...beforeFlows, ...afterFlows].reduce((m, f) => (f.date > m ? f.date : m), T);
  const fBefore = financingWalk(beforeFlows, T, lastDay, settings.financingRateIllustrative);
  const fAfter = financingWalk(afterFlows, T, lastDay, settings.financingRateIllustrative);

  const pctRow = (key: MetricKey, label: string, after: number | null, note: string): MetricRow => ({
    key,
    label,
    unit: "%",
    better: "higher",
    before: 0,
    after: after ?? 0,
    beforeValue: after === null ? null : 0,
    afterValue: after,
    note,
  });
  const row = (key: MetricKey, label: string, unit: MetricRow["unit"], before: number, after: number, extra: Partial<MetricRow> = {}): MetricRow => ({
    key,
    label,
    unit,
    better: "lower",
    before,
    after,
    beforeValue: before,
    afterValue: after,
    ...extra,
  });

  const rows: Record<MetricKey, MetricRow> = {
    payments: row("payments", "Payments (bank transfers)", "count", paymentsBefore, paymentsAfter, {
      note: "Before: one transfer per open invoice. After: hub transfers (pay-ins + pay-outs).",
    }),
    cash: row("cash", "Cash moved", "SAR", cashBefore, cashAfter, { note: "Before: every open amount. After: Σ pay-ins to the hub." }),
    setOff: pctRow("setOff", "Debt settled by set-off", setOffAfter, "1 − cash after ÷ cash before. Paying one by one clears nothing by set-off."),
    theoreticalShare: pctRow(
      "theoreticalShare",
      "Share of theoretical maximum",
      shareAfter,
      "Set-off achieved ÷ the most possible if every invoice could settle on one day.",
    ),
    overdue: row("overdue", `Invoices past the ${settings.maxPaymentDays}-day maximum`, "count", overdue.length, overdue.length, {
      secondary: { before: overdueSar, after: overdueSar, unit: "SAR" },
      note: "Open, held or escalated invoices issued more than 60 days ago. Same before and after: settlement cannot undo the past.",
    }),
    escalated: row("escalated", "Escalated", "count", ledger.escalations.length, ledger.escalations.length, {
      note: "Referred to an authority after the maximum period.",
    }),
    peakFinancing: row("peakFinancing", "Peak financing need", "SAR", fBefore.need, fAfter.need, {
      illustrative: "Illustrative — zero starting cash",
      note: "Σ over companies of the largest cash shortfall while paying before being paid.",
    }),
    financingCost: row("financingCost", "Estimated financing cost", "SAR", fBefore.cost, fAfter.cost, {
      illustrative: FINANCING_LABEL,
      note: `Σ daily shortfall × ${(settings.financingRateIllustrative * 100).toFixed(0)}% ÷ 365, up to ${lastDay}.`,
    }),
  };

  const rounds: RoundSummary[] = valid
    ? plan.rounds.map((r) => {
        const gross = round2(r.settlements.reduce((s, x) => s + x.amount, 0));
        const hubCash = round2(r.legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0));
        return { date: r.date, invoices: new Set(r.settlements.map((s) => s.invoiceId)).size, gross, setOff: round2(gross - hubCash), hubCash, payments: r.legs.length };
      })
    : [];

  return {
    rows,
    order: ["payments", "cash", "setOff", "theoreticalShare", "overdue", "escalated", "peakFinancing", "financingCost"],
    planAvailable: valid,
    cashBefore,
    cashAfter,
    minCash,
    rounds,
    overdue,
    escalations: ledger.escalations,
  };
}

// ---------- Company positions (§5) ----------

export interface CompanyPosition {
  incoming: number; // Σ remaining of open invoices where the company is the seller
  outgoing: number; // Σ remaining of open invoices where it is the buyer
  net: number; // incoming − outgoing (positive = net receiver)
}

export function companyPositions(ledger: Ledger): Map<CompanyId, CompanyPosition> {
  const out = new Map<CompanyId, CompanyPosition>();
  const get = (c: CompanyId) => out.get(c) ?? { incoming: 0, outgoing: 0, net: 0 };
  for (const i of ledger.invoices.filter(isOpen)) {
    const s = get(i.sellerId);
    out.set(i.sellerId, { ...s, incoming: round2(s.incoming + i.remaining), net: round2(s.net + i.remaining) });
    const b = get(i.buyerId);
    out.set(i.buyerId, { ...b, outgoing: round2(b.outgoing + i.remaining), net: round2(b.net - i.remaining) });
  }
  return out;
}
