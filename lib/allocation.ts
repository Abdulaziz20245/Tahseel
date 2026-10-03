// One company's own view (Claude.md §5). Per-invoice split per the allocation rule; never names the
// company on the other side of a hub transfer (D8).

import { companyPositions } from "./metrics";
import type { CompanyId, Constraint, Ledger, LedgerInvoice, Plan } from "./types";

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface InvoiceRow {
  invoice: LedgerInvoice;
  direction: "in" | "out";
  counterpartyId: CompanyId;
  rounds: string[];
  setOff: number;
  hub: number; // paid to hub (out) or received from hub (in)
}

export interface ScheduleRow {
  date: string;
  dir: "in" | "out" | "none"; // in = we pay the hub
  amount: number;
  invoices: number;
}

export interface CompanyView {
  incoming: number;
  outgoing: number;
  net: number;
  payHub: number;
  hubPays: number;
  setOff: number;
  setOffPct: number | null;
  paymentsBefore: { pay: number; receive: number };
  paymentsAfter: { pay: number; receive: number };
  rows: InvoiceRow[];
  schedule: ScheduleRow[];
  constraints: Constraint[];
  status: { changed: boolean; changedAt: number };
}

/** Split `total` over items pro rata, rounded to the halala, remainder on the largest. */
function proRata(items: { id: string; x: number }[], total: number): Map<string, number> {
  const sum = items.reduce((s, i) => s + i.x, 0);
  const out = new Map<string, number>();
  if (sum === 0) return out;
  for (const i of items) out.set(i.id, r2((i.x * total) / sum));
  const diff = r2(total - [...out.values()].reduce((s, v) => s + v, 0));
  if (diff !== 0) {
    const largest = items.reduce((a, b) => (b.x > a.x ? b : a));
    out.set(largest.id, r2(out.get(largest.id)! + diff));
  }
  return out;
}

export function companyView(c: CompanyId, ledger: Ledger, plan: Plan | null, changedAt: Record<CompanyId, number>): CompanyView {
  const pos = companyPositions(ledger).get(c) ?? { incoming: 0, outgoing: 0, net: 0 };
  const mine = ledger.invoices.filter((i) => i.sellerId === c || i.buyerId === c);
  const setOff = new Map<string, number>();
  const hub = new Map<string, number>();
  const rounds = new Map<string, string[]>();
  const schedule: ScheduleRow[] = [];
  const valid = plan && !plan.error ? plan : null;

  for (const r of valid?.rounds ?? []) {
    const out: { id: string; x: number }[] = [];
    const inc: { id: string; x: number }[] = [];
    for (const s of r.settlements) {
      const inv = mine.find((i) => i.id === s.invoiceId);
      if (!inv) continue;
      (inv.buyerId === c ? out : inc).push({ id: s.invoiceId, x: s.amount });
      rounds.set(s.invoiceId, [...(rounds.get(s.invoiceId) ?? []), r.date]);
    }
    if (out.length + inc.length === 0) continue;
    const P = r2(out.reduce((s, i) => s + i.x, 0));
    const R = r2(inc.reduce((s, i) => s + i.x, 0));
    const add = (m: Map<string, number>, id: string, v: number) => m.set(id, r2((m.get(id) ?? 0) + v));
    const payers = P > R ? out : inc; // the side that moves cash through the hub
    const others = P > R ? inc : out;
    const hubShare = proRata(payers, r2(Math.abs(P - R)));
    for (const i of payers) {
      add(hub, i.id, hubShare.get(i.id) ?? 0);
      add(setOff, i.id, r2(i.x - (hubShare.get(i.id) ?? 0)));
    }
    for (const i of others) add(setOff, i.id, i.x);
    schedule.push({ date: r.date, dir: P > R ? "in" : R > P ? "out" : "none", amount: r2(Math.abs(P - R)), invoices: out.length + inc.length });
  }

  const rows: InvoiceRow[] = mine.map((i) => ({
    invoice: i,
    direction: i.sellerId === c ? "in" : "out",
    counterpartyId: i.sellerId === c ? i.buyerId : i.sellerId,
    rounds: rounds.get(i.id) ?? [],
    setOff: setOff.get(i.id) ?? 0,
    hub: hub.get(i.id) ?? 0,
  }));

  const legs = (valid?.rounds ?? []).flatMap((r) => r.legs.filter((l) => l.companyId === c));
  const payHub = r2(legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0));
  const hubPays = r2(legs.filter((l) => l.dir === "out").reduce((s, l) => s + l.amount, 0));
  const half = (pos.incoming + pos.outgoing) / 2;
  const so = r2((pos.incoming + pos.outgoing - payHub - hubPays) / 2);
  const open = new Set(valid?.windows.map((w) => w.invoiceId) ?? []);
  const changedStep = changedAt[c] ?? 0;
  const confirmed = ledger.confirmations[c];
  return {
    ...pos,
    payHub,
    hubPays,
    setOff: so,
    setOffPct: half === 0 ? null : so / half,
    paymentsBefore: {
      pay: mine.filter((i) => open.has(i.id) && i.buyerId === c).length,
      receive: mine.filter((i) => open.has(i.id) && i.sellerId === c).length,
    },
    paymentsAfter: { pay: legs.filter((l) => l.dir === "in").length, receive: legs.filter((l) => l.dir === "out").length },
    rows,
    schedule,
    constraints: ledger.constraints.filter((k) => k.companyId === c),
    status: { changed: changedStep > 0 && (confirmed === undefined || confirmed < changedStep), changedAt: changedStep },
  };
}
