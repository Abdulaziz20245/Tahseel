"use client";

// Detail for the selected company or edge (Claude.md §4.5).

import { useRouter } from "next/navigation";
import type { GraphModel } from "@/lib/graphModel";
import type { Ledger, Plan } from "@/lib/types";
import { date, sar } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  partly_settled: "Partly settled",
  settled: "Settled",
  held: "On hold",
  escalated: "Escalated",
  paid_outside: "Paid outside Tahseel",
};

interface Props {
  model: GraphModel;
  ledger: Ledger;
  plan: Plan | null;
  companyId: string | null;
  edgeId: string | null;
}

export default function NodeDetailCard({ model, ledger, plan, companyId, edgeId }: Props) {
  const router = useRouter();

  if (edgeId) {
    const key = edgeId.replace(/^(pair|problem):/, "");
    const edge = [...model.pairEdges, ...model.problemEdges].find((e) => e.id === key && edgeId.startsWith(model.problemEdges.includes(e) ? "problem" : "pair"));
    if (!edge) return <Empty />;
    const names = new Map(model.companies.map((c) => [c.id, c.name]));
    const roundsOf = (id: string) => (plan?.rounds ?? []).filter((r) => r.settlements.some((s) => s.invoiceId === id)).map((r) => date(r.date));
    return (
      <Card title={`${names.get(edge.payerId)} → ${names.get(edge.payeeId)}`}>
        <p className="text-xs text-muted">
          {edge.count} invoice{edge.count === 1 ? "" : "s"} · {sar(edge.total)} · {edgeId.startsWith("problem") ? "excluded from settlement" : "payer → payee"}
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="num w-full text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-1 pr-2 font-semibold">Invoice</th>
                <th className="py-1 pr-2 text-right font-semibold">Amount</th>
                <th className="py-1 pr-2 font-semibold">Due</th>
                <th className="py-1 pr-2 font-semibold">Round</th>
                <th className="py-1 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {edge.invoiceIds.map((id) => {
                const inv = ledger.invoices.find((i) => i.id === id)!;
                return (
                  <tr key={id} className="border-b border-line last:border-0">
                    <td className="py-1 pr-2 whitespace-nowrap">{id}</td>
                    <td className="py-1 pr-2 text-right whitespace-nowrap">{sar(inv.remaining)}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">{date(inv.dueDate)}</td>
                    <td className="py-1 pr-2">{roundsOf(id).join(", ") || "—"}</td>
                    <td className="py-1">{STATUS_LABEL[inv.derivedStatus]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  const c = companyId ? model.companies.find((x) => x.id === companyId) : null;
  if (!c) return <Empty />;
  return (
    <Card title={c.name}>
      <p className="text-xs text-muted">
        {c.sector} · {c.city}
      </p>
      <dl className="num mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Incoming (owed to it)</dt>
        <dd className="text-right">{sar(c.incoming)}</dd>
        <dt className="text-muted">Outgoing (it owes)</dt>
        <dd className="text-right">{sar(c.outgoing)}</dd>
        <dt className="text-muted">Net position</dt>
        <dd className="text-right font-semibold">{sar(c.net)}</dd>
        <dt className="text-muted">Payments before → after</dt>
        <dd className="text-right">
          {c.paymentsBefore} → {c.paymentsAfter}
        </dd>
        <dt className="text-muted">Rounds</dt>
        <dd className="text-right">{c.rounds.map(date).join(", ") || "—"}</dd>
      </dl>
      {c.badges.changed && <p className="mt-2 text-xs text-warn">Proposal changed at event {c.badges.changedAt} — awaiting confirmation</p>}
      <button
        type="button"
        onClick={() => router.push("/companies")}
        className="mt-3 rounded-md border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        Open dashboard
      </button>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="detail-heading" className="rounded-md border border-line bg-canvas p-4">
      <h2 id="detail-heading" className="text-sm font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <section className="rounded-md border border-dashed border-line bg-subtle p-4 text-sm text-muted">
      Select a company or an arrow on the graph to see its details.
    </section>
  );
}
