// Ledger + plan → what the network graph shows (Claude.md §4). Pure, so it can be tested; the
// React Flow components only draw what this returns.

import { daysBetween } from "./dates";
import { companyPositions, scopeInvoices } from "./metrics";
import type { CompanyId, Dataset, Leg, Ledger, LedgerInvoice, Plan } from "./types";

export const ROUND_COLOURS = ["#12355B", "#0E7C7B", "#B7791F", "#7A4EAB", "#C2410C", "#4D7C0F"];
/** Colour of a round, fixed by its calendar week (counted from the base scenario date), so a round keeps its colour across steps. */
export const roundColour = (date: string, anchor: string) => ROUND_COLOURS[Math.max(0, Math.floor(daysBetween(anchor, date) / 7)) % ROUND_COLOURS.length];

export interface GraphCompany {
  id: CompanyId;
  name: string;
  shortName: string;
  sector: string;
  city: string;
  x: number;
  y: number;
  incoming: number;
  outgoing: number;
  net: number;
  paymentsBefore: number; // invoices in scope it pays or is paid
  paymentsAfter: number; // its hub legs over all rounds
  rounds: string[]; // round dates it takes part in
  badges: { changed: boolean; changedAt: number; escalation: boolean; cap: boolean; timeLimit: boolean };
}

export interface PairEdge {
  id: string; // "PAYER>PAYEE"
  payerId: CompanyId;
  payeeId: CompanyId;
  invoiceIds: string[];
  total: number; // SAR remaining
  count: number; // invoices = baseline payments on this pair
  tier: 1 | 2 | 3; // thickness by amount tercile
  roundDates: string[]; // rounds its invoices settle in (after view)
  changed: boolean; // round assignment differs from the previous step
}

export interface HubEdge {
  id: string;
  companyId: CompanyId;
  dir: Leg["dir"]; // "in" = company → hub, "out" = hub → company
  amount: number;
}

export interface GraphRound {
  date: string;
  colour: string;
  payIn: number; // Σ pay-ins (= Σ pay-outs)
  hubEdges: HubEdge[];
  settlements: number;
}

export interface GraphModel {
  companies: GraphCompany[];
  pairEdges: PairEdge[]; // open invoices in scope, aggregated per payer → payee
  problemEdges: PairEdge[]; // held or escalated invoices, per pair (dotted red)
  rounds: GraphRound[];
}

export interface GraphInput {
  data: Dataset;
  ledger: Ledger;
  plan: Plan | null;
  previousPlan: Plan | null;
  changedAt: Record<CompanyId, number>;
}

function roundsOfInvoice(plan: Plan | null): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of plan?.rounds ?? []) for (const s of r.settlements) m.set(s.invoiceId, [...(m.get(s.invoiceId) ?? []), r.date]);
  return m;
}

function groupByPair(invoices: LedgerInvoice[]): Map<string, LedgerInvoice[]> {
  const m = new Map<string, LedgerInvoice[]>();
  for (const i of invoices) {
    const k = `${i.buyerId}>${i.sellerId}`;
    m.set(k, [...(m.get(k) ?? []), i]);
  }
  return m;
}

/** Tercile cut points of a list of amounts (1 = thin, 2 = medium, 3 = thick). */
function tierOf(amounts: number[]): (v: number) => 1 | 2 | 3 {
  const sorted = [...amounts].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const [t1, t2] = [q(1 / 3), q(2 / 3)];
  return (v) => (v < t1 ? 1 : v < t2 ? 2 : 3);
}

export function buildGraphModel({ data, ledger, plan, previousPlan, changedAt }: GraphInput): GraphModel {
  const validPlan = plan && !plan.error ? plan : null;
  const scope = scopeInvoices(ledger, plan);
  const positions = companyPositions(ledger);
  const now = roundsOfInvoice(validPlan);
  const before = roundsOfInvoice(previousPlan && !previousPlan.error ? previousPlan : null);

  const pairs = groupByPair(scope);
  const tier = tierOf([...pairs.values()].map((l) => l.reduce((s, i) => s + i.remaining, 0)));
  const toEdge = (id: string, list: LedgerInvoice[]): PairEdge => {
    const total = Math.round(list.reduce((s, i) => s + i.remaining, 0) * 100) / 100;
    const dates = [...new Set(list.flatMap((i) => now.get(i.id) ?? []))].sort();
    const changed = previousPlan !== null && list.some((i) => (now.get(i.id) ?? []).join() !== (before.get(i.id) ?? []).join());
    return {
      id,
      payerId: list[0].buyerId,
      payeeId: list[0].sellerId,
      invoiceIds: list.map((i) => i.id).sort(),
      total,
      count: list.length,
      tier: tier(total),
      roundDates: dates,
      changed,
    };
  };
  const pairEdges = [...pairs].sort((a, b) => a[0].localeCompare(b[0])).map(([id, list]) => toEdge(id, list));

  const problems = ledger.invoices.filter((i) => i.derivedStatus === "held" || i.derivedStatus === "escalated");
  const problemEdges = [...groupByPair(problems)].sort((a, b) => a[0].localeCompare(b[0])).map(([id, list]) => ({ ...toEdge(id, list), roundDates: [] }));

  const rounds: GraphRound[] = (validPlan?.rounds ?? []).map((r) => ({
    date: r.date,
    colour: roundColour(r.date, data.settings.scenarioDate),
    payIn: Math.round(r.legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0) * 100) / 100,
    settlements: r.settlements.length,
    hubEdges: r.legs.map((l) => ({ id: `hub-${r.date}-${l.companyId}`, companyId: l.companyId, dir: l.dir, amount: l.amount })),
  }));

  const companies: GraphCompany[] = data.companies.map((c) => {
    const pos = positions.get(c.id) ?? { incoming: 0, outgoing: 0, net: 0 };
    const changedStep = changedAt[c.id] ?? 0;
    const confirmedAt = ledger.confirmations[c.id];
    const openIds = new Set(scope.map((i) => i.id));
    return {
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      sector: c.sector,
      city: c.city,
      x: c.x,
      y: c.y,
      ...pos,
      paymentsBefore: scope.filter((i) => i.buyerId === c.id || i.sellerId === c.id).length,
      paymentsAfter: (validPlan?.rounds ?? []).reduce((s, r) => s + r.legs.filter((l) => l.companyId === c.id).length, 0),
      rounds: (validPlan?.rounds ?? [])
        .filter((r) => r.settlements.some((s) => scope.some((i) => i.id === s.invoiceId && (i.buyerId === c.id || i.sellerId === c.id))))
        .map((r) => r.date),
      badges: {
        changed: changedStep > 0 && (confirmedAt === undefined || confirmedAt < changedStep),
        changedAt: changedStep,
        escalation: ledger.escalations.some((e) => e.payerId === c.id),
        cap: ledger.constraints.some((k) => k.kind === "weeklyCap" && k.companyId === c.id),
        timeLimit: ledger.constraints.some((k) => k.kind !== "weeklyCap" && k.companyId === c.id && !!k.invoiceId && openIds.has(k.invoiceId)),
      },
    };
  });

  return { companies, pairEdges, problemEdges, rounds };
}
