// Compact scenario snapshot sent with each assistant question (Claude.md §9.6). A company snapshot
// holds only that company's own view (D8).

import { companyView } from "./allocation";
import { companyPositions, type Metrics } from "./metrics";
import type { CompanyId, Dataset, Ledger, Plan } from "./types";

export type Perspective = "government" | CompanyId;

export function buildSnapshot(
  perspective: Perspective,
  data: Dataset,
  step: number,
  ledger: Ledger,
  plan: Plan | null,
  metrics: Metrics | null,
  changedAt: Record<CompanyId, number>,
): Record<string, unknown> {
  const name = (id: string) => data.companies.find((c) => c.id === id)?.name ?? id;
  const base = {
    note: "Synthetic demo scenario. Amounts in SAR including 15% VAT.",
    step,
    lastEvent: step > 0 ? data.events[step - 1].title : "Starting scenario",
    scenarioDate: ledger.date,
  };

  if (perspective === "government") {
    const pos = companyPositions(ledger);
    return {
      ...base,
      perspective: "Government (full network)",
      metrics: metrics
        ? Object.fromEntries(metrics.order.map((k) => [metrics.rows[k].label, { before: metrics.rows[k].before, after: metrics.rows[k].after, unit: metrics.rows[k].unit }]))
        : null,
      rounds: metrics?.rounds ?? [],
      roundTransfers: (plan?.rounds ?? []).map((r) => ({ date: r.date, legs: r.legs.map((l) => ({ company: name(l.companyId), action: l.dir === "in" ? "pays hub" : "paid by hub", amount: l.amount })) })),
      escalations: ledger.escalations.map((e) => ({ invoice: e.invoiceId, payer: name(e.payerId), authority: e.authority, date: e.date })),
      companies: data.companies.map((c) => ({ id: c.id, name: c.name, ...(pos.get(c.id) ?? { incoming: 0, outgoing: 0, net: 0 }) })),
      constraintBreaks: plan?.breaks.map((b) => b.reason) ?? [],
    };
  }

  const v = companyView(perspective, ledger, plan, changedAt);
  return {
    ...base,
    perspective: `Company: ${name(perspective)} (own data only)`,
    summary: {
      incoming: v.incoming,
      outgoing: v.outgoing,
      net: v.net,
      wePayTheHub: v.payHub,
      theHubPaysUs: v.hubPays,
      clearedBySetOff: v.setOff,
      paymentsWeMake: `${v.paymentsBefore.pay} before → ${v.paymentsAfter.pay} after`,
      paymentsWeReceive: `${v.paymentsBefore.receive} before → ${v.paymentsAfter.receive} after`,
      proposal: v.status.changed ? `Changed at event ${v.status.changedAt}, awaiting confirmation` : "Confirmed or unchanged",
    },
    invoices: v.rows.map((r) => ({
      id: r.invoice.id,
      direction: r.direction === "in" ? "owed to us" : "we owe",
      counterparty: name(r.counterpartyId),
      due: r.invoice.dueDate,
      amount: r.invoice.total,
      status: r.invoice.derivedStatus,
      rounds: r.rounds,
      clearedBySetOff: r.setOff,
      [r.direction === "out" ? "paidToHub" : "receivedFromHub"]: r.hub,
    })),
    schedule: v.schedule.map((s) => ({ date: s.date, action: s.dir === "in" ? "pay hub" : s.dir === "out" ? "receive from hub" : "fully set off", amount: s.amount })),
    constraints: v.constraints.map((k) => ({ kind: k.kind, invoice: k.invoiceId, date: k.date, amount: k.amount, note: k.note })),
  };
}
