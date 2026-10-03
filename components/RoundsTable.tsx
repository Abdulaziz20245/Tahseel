"use client";

// Settlement rounds at this step (Claude.md §6). A row opens that round on the Network tab.

import { useRouter } from "next/navigation";
import type { RoundSummary } from "@/lib/metrics";
import { date, num, sar } from "@/lib/format";
import { useScenario } from "@/lib/ScenarioProvider";

export default function RoundsTable({ rounds }: { rounds: RoundSummary[] }) {
  const router = useRouter();
  const { setSelectedRoundDate } = useScenario();
  const open = (d: string) => {
    setSelectedRoundDate(d);
    router.push("/network");
  };

  return (
    <section aria-labelledby="rounds-heading" className="rounded-md border border-line bg-canvas p-4">
      <h2 id="rounds-heading" className="text-sm font-semibold text-ink">
        Settlement rounds
      </h2>
      {rounds.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No rounds at this step.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="num w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 text-right font-semibold">Invoices</th>
                <th className="py-2 pr-3 text-right font-semibold">Gross</th>
                <th className="py-2 pr-3 text-right font-semibold">Cleared by set-off</th>
                <th className="py-2 pr-3 text-right font-semibold">Hub cash</th>
                <th className="py-2 text-right font-semibold">Payments</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr
                  key={r.date}
                  tabIndex={0}
                  role="link"
                  aria-label={`Show the ${date(r.date)} round on the network`}
                  onClick={() => open(r.date)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(r.date))}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <td className="py-2 pr-3 whitespace-nowrap text-primary underline-offset-2 hover:underline">{date(r.date)}</td>
                  <td className="py-2 pr-3 text-right">{num(r.invoices)}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{sar(r.gross)}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{sar(r.setOff)}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{sar(r.hubCash)}</td>
                  <td className="py-2 text-right">{num(r.payments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">An invoice split across rounds is counted in each round it appears in. Select a row to see it on the graph.</p>
    </section>
  );
}
