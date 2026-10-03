"use client";

// Algorithm tab (Claude.md §3.4, §7): the model in plain English, real solver stats, validator checks,
// a round replay (an explanation of the result, not the search) and the exact LP text sent to HiGHS.

import { useMemo, useState } from "react";
import { buildLp } from "@/lib/optimizer/buildLp";
import { computeWindows } from "@/lib/optimizer/windows";
import { date, num, sar } from "@/lib/format";
import { useLedger, usePlan, useScenario } from "@/lib/ScenarioProvider";

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-canvas p-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-2 text-sm text-ink">{children}</div>
    </section>
  );
}

export default function AlgorithmView() {
  const { data, selectedRoundDate, setSelectedRoundDate } = useScenario();
  const { ledger } = useLedger();
  const { plan, isSolving, method, solveMs } = usePlan();
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const model = useMemo(() => {
    if (!plan || plan.method !== "mip" || plan.windows.length === 0) return null;
    const wr = computeWindows(ledger, data.settings.maxPaymentDays, data.settings.scenarioDate);
    const m = buildLp(wr, ledger.date);
    const slack = plan.stats.find((s) => s.pass === 0)?.value ?? 0;
    const payments = Math.round(plan.stats.find((s) => s.pass === 1)?.value ?? 0);
    return { counts: m.counts, invoices: wr.windows.length, days: wr.days.length, lp: m.lpText(2, { slack: Math.max(0, slack), payments }) };
  }, [plan, ledger, data.settings]);

  if (!plan) return <p className="text-sm text-muted">Loading the optimiser…</p>;
  const rounds = plan.rounds;
  const idx = Math.max(0, rounds.findIndex((r) => r.date === selectedRoundDate));
  const round = rounds[idx];
  const optimal = plan.method === "mip" && plan.stats.length > 0 && plan.stats.every((s) => s.status === "Optimal") && !plan.error;
  const total = plan.stats.reduce((s, x) => s + x.timeMs, 0);
  const lpLines = model?.lp.split("\n") ?? [];
  const names = (id: string) => data.companies.find((c) => c.id === id)?.shortName ?? id;

  return (
    <div className={`flex flex-col gap-6 ${isSolving ? "opacity-60" : ""}`}>
      <Box title="The problem">
        <p>
          Companies owe each other through many invoices. They cannot all settle at once: each invoice has a due date, payers can set time limits
          (&ldquo;pay this in 10 days&rdquo;) and weekly caps, and nothing may settle more than {data.settings.maxPaymentDays} days after issue.
          The optimiser chooses, for every invoice, how much settles in which weekly round. Its goals, in strict priority: break as few constraints
          as possible, then make the fewest payments, then move the least cash. Every payment goes through the hub, which pays out only what it
          has received that day.
        </p>
      </Box>

      <div className="grid gap-6 xl:grid-cols-2">
        <Box title="Model (live)">
          {model ? (
            <>
              <dl className="num grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted">Invoices in the model</dt>
                <dd>{num(model.invoices)}</dd>
                <dt className="text-muted">Candidate round days</dt>
                <dd>{num(model.days)}</dd>
                <dt className="text-muted">Continuous variables</dt>
                <dd>{num(model.counts.continuous)}</dd>
                <dt className="text-muted">Binary variables</dt>
                <dd>{num(model.counts.binary)}</dd>
                <dt className="text-muted">Constraints</dt>
                <dd>{num(model.counts.constraints)}</dd>
              </dl>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                <li><code className="num">Σ_d x[i,d] = remaining[i]</code> — every open invoice settles in full.</li>
                <li><code className="num">received − paid = out[c,d] − in[c,d]</code> — a company only moves its net per round.</li>
                <li><code className="num">in[c,d] ≤ M·yi[c,d]</code> — a pay-in counts as one payment.</li>
                <li><code className="num">Σ_week in[c,d] ≤ cap[c] + slack</code> — weekly caps (slack = a break).</li>
                <li><code className="num">Σ_c in[c,d] = Σ_c out[c,d]</code> — the hub never pays out unreceived money.</li>
              </ul>
            </>
          ) : (
            <p className="text-muted">{plan.method === "heuristic" ? "Heuristic plan — no model solved." : "Nothing to settle at this step."}</p>
          )}
        </Box>

        <Box title="Solver passes (HiGHS, real statistics)">
          {plan.method === "heuristic" ? (
            <p className="text-warn">Heuristic plan — optimality not proven.</p>
          ) : (
            <>
              <table className="num w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1 pr-2 font-semibold">Pass</th>
                    <th className="py-1 pr-2 font-semibold">Goal</th>
                    <th className="py-1 pr-2 text-right font-semibold">Value</th>
                    <th className="py-1 pr-2 font-semibold">Status</th>
                    <th className="py-1 text-right font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.stats.map((s) => (
                    <tr key={s.pass} className="border-b border-line last:border-0">
                      <td className="py-1 pr-2">{s.pass}</td>
                      <td className="py-1 pr-2">{s.objective}</td>
                      <td className="py-1 pr-2 text-right">{s.pass === 2 ? sar(s.value) : num(Math.round(s.value * 100) / 100)}</td>
                      <td className={`py-1 pr-2 ${s.status === "Optimal" ? "text-good" : "text-bad"}`}>{s.status}</td>
                      <td className="py-1 text-right">{s.timeMs.toFixed(0)} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="num mt-2 text-xs text-muted">
                Total solver time {total.toFixed(0)} ms{solveMs === 0 ? " (result reused from cache for this step)" : ""}. Gap: 0.01 SAR absolute, 0 relative.
              </p>
              {optimal ? (
                <p className="mt-2 w-fit rounded-md border border-good px-2 py-0.5 text-xs font-semibold text-good">Proven optimal for this model</p>
              ) : (
                plan.stats.length > 0 && <p className="mt-2 text-xs text-bad">Not proven optimal: {plan.error ?? "see statuses"}</p>
              )}
              {method === "heuristic" && <p className="text-warn">Exact solver unavailable.</p>}
            </>
          )}
        </Box>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Box title="Validator checks (run after every solve)">
          <ul className="flex flex-col gap-1">
            {plan.checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className={c.ok ? "text-good" : "text-bad"} aria-label={c.ok ? "passed" : "failed"}>
                  {c.ok ? "✓" : "✗"}
                </span>
                <span>
                  {c.label}
                  {c.detail && <span className="block text-xs text-bad">{c.detail}</span>}
                </span>
              </li>
            ))}
            {plan.checks.length === 0 && <li className="text-muted">No plan to check at this step.</li>}
          </ul>
          {plan.breaks.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold text-bad">Constraint breaks</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-bad">
                {plan.breaks.map((b, i) => (
                  <li key={i}>
                    {names(b.companyId)}: {b.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Box>

        <Box title="Round replay">
          <p className="text-xs text-muted">Explains the computed plan; it is not the solver&apos;s internal search.</p>
          {round ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" disabled={idx === 0} onClick={() => setSelectedRoundDate(rounds[idx - 1].date)}
                  className="rounded-md border border-line px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">
                  Prev round
                </button>
                <span className="num font-semibold">
                  Round {idx + 1} of {rounds.length}: {date(round.date)}
                </span>
                <button type="button" disabled={idx === rounds.length - 1} onClick={() => setSelectedRoundDate(rounds[idx + 1].date)}
                  className="rounded-md border border-line px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">
                  Next round
                </button>
              </div>
              {(() => {
                const gross = round.settlements.reduce((s, x) => s + x.amount, 0);
                const moved = round.legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0);
                return (
                  <div className="mt-3">
                    <div className="flex h-4 w-full overflow-hidden rounded-md border border-line">
                      <div className="bg-accent" style={{ width: `${gross ? ((gross - moved) / gross) * 100 : 0}%` }} />
                      <div className="bg-primary" style={{ width: `${gross ? (moved / gross) * 100 : 0}%` }} />
                    </div>
                    <p className="num mt-1 text-xs text-muted">
                      {sar(gross)} of invoices: <span className="text-accent">{sar(gross - moved)} cleared by set-off</span>,{" "}
                      <span className="text-primary">{sar(moved)} moved through the hub</span>
                    </p>
                  </div>
                );
              })()}
              <div className="num mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-muted">Invoices settled</p>
                  <ul className="mt-1 max-h-48 overflow-y-auto text-xs">
                    {round.settlements.map((s) => (
                      <li key={s.invoiceId} className="flex justify-between gap-2">
                        <span>{s.invoiceId}</span>
                        <span>{sar(s.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Each company&apos;s net this round</p>
                  <ul className="mt-1 text-xs">
                    {data.companies.map((c) => {
                      const leg = round.legs.find((l) => l.companyId === c.id);
                      const involved = leg || round.settlements.some((s) => {
                        const inv = ledger.invoices.find((i) => i.id === s.invoiceId);
                        return inv && (inv.buyerId === c.id || inv.sellerId === c.id);
                      });
                      if (!involved) return null;
                      return (
                        <li key={c.id} className="flex justify-between gap-2">
                          <span>{c.shortName}</span>
                          <span className={leg ? (leg.dir === "in" ? "text-primary" : "text-good") : "text-muted"}>
                            {leg ? `${leg.dir === "in" ? "pays in" : "paid out"} ${sar(leg.amount)}` : "zero — fully set off"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-muted">No rounds at this step.</p>
          )}
        </Box>
      </div>

      <Box title="Generated model (CPLEX LP text, pass 2, exactly as sent to HiGHS)">
        {model ? (
          <>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-md border border-line px-2 py-1">
                {showAll ? "Show first 300 lines" : `Show all ${lpLines.length} lines`}
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(model.lp).then(() => setCopied(true))}
                className="rounded-md border border-line px-2 py-1"
              >
                {copied ? "Copied" : "Copy LP text"}
              </button>
            </div>
            <pre className="num mt-2 max-h-96 overflow-auto rounded-md border border-line bg-subtle p-3 text-xs leading-5">
              {(showAll ? lpLines : lpLines.slice(0, 300)).join("\n")}
              {!showAll && lpLines.length > 300 ? `\n… ${lpLines.length - 300} more lines` : ""}
            </pre>
          </>
        ) : (
          <p className="text-muted">No model at this step.</p>
        )}
      </Box>

      <Box title="Why HiGHS">
        <p>
          The plan is a mixed-integer program: amounts are continuous, &ldquo;does this company make a payment that day&rdquo; is yes/no. Google
          OR-Tools has no JavaScript API, so it would need a separate server. HiGHS is an open-source (MIT) solver that runs here in your browser as
          WebAssembly, supports integer variables and proves optimality, so every number on this site is computed live from the scenario data.
        </p>
      </Box>
    </div>
  );
}
