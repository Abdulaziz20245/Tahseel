"use client";

// Invoices past the maximum period, and escalations (Claude.md §6). A row opens the payer's dashboard.

import { useRouter } from "next/navigation";
import type { Metrics } from "@/lib/metrics";
import { date, sar } from "@/lib/format";
import { useScenario } from "@/lib/ScenarioProvider";

const STATUS: Record<string, string> = { open: "Open", partly_settled: "Partly settled", held: "On hold", escalated: "Escalated" };

export default function OverdueList({ metrics, maxDays }: { metrics: Metrics; maxDays: number }) {
  const router = useRouter();
  const { data, setSelectedCompanyId } = useScenario();
  const name = (id: string) => data.companies.find((c) => c.id === id)?.name ?? id;
  const open = (payerId: string) => {
    setSelectedCompanyId(payerId);
    router.push("/companies");
  };

  return (
    <section aria-labelledby="overdue-heading" className="rounded-md border border-line bg-canvas p-4">
      <h2 id="overdue-heading" className="text-sm font-semibold text-ink">
        Past the {maxDays}-day maximum and escalations
      </h2>
      {metrics.overdue.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No invoice is past the maximum period. No escalations at this step.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="num w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Invoice</th>
                <th className="py-2 pr-3 font-semibold">Payer</th>
                <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Authority</th>
                <th className="py-2 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {metrics.overdue.map((o) => (
                <tr
                  key={o.invoiceId}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open ${name(o.payerId)}'s dashboard`}
                  onClick={() => open(o.payerId)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(o.payerId))}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <td className="py-2 pr-3 whitespace-nowrap">{o.invoiceId}</td>
                  <td className="py-2 pr-3 text-primary">{name(o.payerId)}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{sar(o.amount)}</td>
                  <td className={`py-2 pr-3 ${o.status === "escalated" ? "font-semibold text-bad" : ""}`}>{STATUS[o.status] ?? o.status}</td>
                  <td className="py-2 pr-3">{o.escalation?.authority ?? "—"}</td>
                  <td className="py-2 whitespace-nowrap">{o.escalation ? date(o.escalation.date) : `issued ${date(o.issueDate)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Escalation routing is illustrative: disputes go to MoJ, other late payment to MoF.</p>
    </section>
  );
}
