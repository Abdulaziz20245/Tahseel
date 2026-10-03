"use client";

// Companies tab (Claude.md §5): one company's own view. Read-only (D4); hub counterparties never shown (D8).

import { useMemo, useState } from "react";
import { companyView } from "@/lib/allocation";
import { date, num, pct, sar } from "@/lib/format";
import { useLedger, usePlan, useScenario } from "@/lib/ScenarioProvider";

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "border-line text-ink" },
  partly_settled: { label: "Partly settled", cls: "border-accent text-accent" },
  settled: { label: "Settled", cls: "border-good text-good" },
  held: { label: "On hold — sides disagree", cls: "border-warn text-warn" },
  escalated: { label: "Escalated", cls: "border-bad text-bad" },
  paid_outside: { label: "Paid outside Tahseel", cls: "border-line text-muted" },
};

function Card({ label, value, before }: { label: string; value: string; before?: string }) {
  return (
    <div className="rounded-md border border-line bg-canvas p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-1 text-xl font-semibold text-ink">{value}</p>
      {before && <p className="num text-xs text-muted">{before}</p>}
    </div>
  );
}

export default function CompaniesView() {
  const { data, stepIndex, selectedCompanyId, setSelectedCompanyId } = useScenario();
  const { ledger } = useLedger();
  const { plan, changedAt, isSolving } = usePlan();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [sort, setSort] = useState<"due" | "amount">("due");

  const id = selectedCompanyId ?? data.companies[0].id;
  const company = data.companies.find((c) => c.id === id)!;
  const view = useMemo(() => companyView(id, ledger, plan, changedAt), [id, ledger, plan, changedAt]);
  const name = (cid: string) => data.companies.find((c) => c.id === cid)?.name ?? cid;
  const escalation = (iid: string) => ledger.escalations.find((e) => e.invoiceId === iid);

  const rows = view.rows
    .filter((r) => filter === "all" || r.direction === filter)
    .sort((a, b) => (sort === "due" ? a.invoice.dueDate.localeCompare(b.invoice.dueDate) : b.invoice.total - a.invoice.total));
  const options = data.companies.filter((c) => (c.name + c.id).toLowerCase().includes(query.toLowerCase()));
  const anyOpen = view.rows.some((r) => r.invoice.derivedStatus === "open" || r.invoice.derivedStatus === "partly_settled");

  return (
    <div className={`flex flex-col gap-6 ${isSolving ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-muted">
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Company name"
            className="mt-1 w-48 rounded-md border border-line px-2 py-1.5 text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col text-sm text-muted">
          Company
          <select
            value={id}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="mt-1 w-72 rounded-md border border-line bg-canvas px-2 py-1.5 text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {(options.some((c) => c.id === id) ? options : [company, ...options]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-sm text-muted">
          {company.sector} · {company.city} · VAT {company.vatNumber} (synthetic)
        </p>
      </div>

      <section className="rounded-md border border-line bg-canvas p-4 text-sm">
        <h2 className="font-semibold text-ink">Proposal status</h2>
        {view.status.changed ? (
          <p className="mt-1 text-warn">Changed at event {view.status.changedAt} — awaiting confirmation</p>
        ) : (
          <p className="mt-1 text-good">{stepIndex === 0 && !ledger.confirmations[id] ? "Current proposal (no changes yet)" : "Confirmed"}</p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Incoming (owed to us)" value={sar(view.incoming)} />
        <Card label="Outgoing (we owe)" value={sar(view.outgoing)} />
        <Card label="Net position" value={sar(view.net)} before={view.net >= 0 ? "Net receiver" : "Net payer"} />
        <Card label="Cleared by set-off" value={sar(view.setOff)} before={`${pct(view.setOffPct)} of what we owe and are owed`} />
        <Card label="We pay the hub" value={sar(view.payHub)} before={`Before: we pay ${sar(view.outgoing)} invoice by invoice`} />
        <Card label="The hub pays us" value={sar(view.hubPays)} before={`Before: we receive ${sar(view.incoming)} invoice by invoice`} />
        <Card label="Payments we make" value={`${num(view.paymentsBefore.pay)} → ${num(view.paymentsAfter.pay)}`} before="Invoices paid one by one → hub pay-ins" />
        <Card label="Payments we receive" value={`${num(view.paymentsBefore.receive)} → ${num(view.paymentsAfter.receive)}`} before="Invoices received → hub pay-outs" />
      </div>

      <section className="rounded-md border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Invoices</h2>
          <div className="flex gap-2 text-sm">
            {(["all", "in", "out"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-md border px-2 py-1 ${filter === f ? "border-primary bg-primary text-white" : "border-line text-muted"}`}
              >
                {f === "all" ? "All" : f === "in" ? "Incoming" : "Outgoing"}
              </button>
            ))}
            <select value={sort} onChange={(e) => setSort(e.target.value as "due" | "amount")} className="rounded-md border border-line px-2 py-1">
              <option value="due">Sort: due date</option>
              <option value="amount">Sort: amount</option>
            </select>
          </div>
        </div>
        {!anyOpen && <p className="mt-2 text-sm text-muted">No open invoices at this step.</p>}
        <div className="mt-2 overflow-x-auto">
          <table className="num w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                {["Invoice", "Dir.", "Counterparty", "Issued", "Due", "Amount (incl. VAT)", "Round(s)", "Cleared by set-off", "Paid to / received from hub", "Status"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS[r.invoice.derivedStatus];
                const esc = escalation(r.invoice.id);
                return (
                  <tr key={r.invoice.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.invoice.id}</td>
                    <td className="py-2 pr-3">{r.direction === "in" ? "In" : "Out"}</td>
                    <td className="py-2 pr-3">{name(r.counterpartyId)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{date(r.invoice.issueDate)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{date(r.invoice.dueDate)}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{sar(r.invoice.total)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.rounds.map(date).join(", ") || "—"}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{r.rounds.length ? sar(r.setOff) : "—"}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {r.rounds.length ? `${r.direction === "out" ? "Paid to hub" : "Received from hub"} ${sar(r.hub)}` : "—"}
                    </td>
                    <td className="py-2">
                      <span className={`rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap ${s.cls}`}>
                        {esc ? `Escalated to ${esc.authority.split(" ")[0]} on ${date(esc.date)}` : s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Amounts settled in the plan. Hub transfers never show which company the money came from or went to.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border border-line bg-canvas p-4">
          <h2 className="text-sm font-semibold text-ink">Settlement schedule</h2>
          {view.schedule.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing scheduled at this step.</p>
          ) : (
            <table className="num mt-2 w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Action</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-3 text-right font-semibold">Invoices</th>
                  <th className="py-2 font-semibold">Confirmation</th>
                </tr>
              </thead>
              <tbody>
                {view.schedule.map((s) => (
                  <tr key={s.date} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{date(s.date)}</td>
                    <td className="py-2 pr-3">{s.dir === "in" ? "Pay to hub" : s.dir === "out" ? "Receive from hub" : "No transfer (fully set off)"}</td>
                    <td className="py-2 pr-3 text-right">{s.dir === "none" ? "—" : sar(s.amount)}</td>
                    <td className="py-2 pr-3 text-right">{s.invoices}</td>
                    <td className="py-2">{view.status.changed ? "Awaiting" : ledger.confirmations[id] ? "Confirmed" : "Proposed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="rounded-md border border-line bg-canvas p-4">
          <h2 className="text-sm font-semibold text-ink">Constraints</h2>
          {view.constraints.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No time limits or weekly cap.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {view.constraints.map((k) => {
                const step = data.events.findIndex((e) => e.type === "constraint_set" && e.constraint.id === k.id) + 1;
                const broken = plan?.breaks.find((b) => b.constraintId === k.id || (b.kind === "weeklyCap" && k.kind === "weeklyCap" && b.companyId === id));
                return (
                  <li key={k.id} className="rounded-md border border-line p-2">
                    <p className="font-semibold text-ink">
                      {k.kind === "weeklyCap" ? `Weekly cap ${sar(k.amount ?? 0)}` : `${k.kind === "notBefore" ? "Not before" : "Not after"} ${date(k.date!)} on ${k.invoiceId}`}
                    </p>
                    <p className="text-muted">
                      &ldquo;{k.note}&rdquo; · {step > 0 ? `set at event ${step}` : "in place at the start"}
                    </p>
                    {broken && <p className="text-bad">{broken.reason}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
