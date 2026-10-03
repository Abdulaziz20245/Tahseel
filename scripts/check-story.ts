// npm run check-story — replays steps 0..N with the real HiGHS solver and prints what each event
// does to the plan, so the §8.6 story can be checked against the data.
import loadHighs from "highs";
import { dataResult } from "../lib/data";
import { date, sar } from "../lib/format";
import { companySchedule } from "../lib/ledger";
import { createEngine } from "../lib/optimizer/engine";
import type { Plan } from "../lib/types";

if (!dataResult.ok) {
  console.error("Data invalid — run npm run validate.");
  process.exit(1);
}
const data = dataResult.data;

const payments = (p: Plan) => p.rounds.reduce((s, r) => s + r.legs.length, 0);
const cash = (p: Plan) => p.rounds.reduce((s, r) => s + r.legs.filter((l) => l.dir === "in").reduce((a, l) => a + l.amount, 0), 0);

async function main() {
  const highs = await loadHighs();
  const engine = createEngine(data, highs);
  const allTimes: number[] = [];
  let failures = 0;

  for (let k = 0; k <= data.events.length; k++) {
    const t0 = performance.now();
    const { ledger, plan, previousPlan, eventResults } = engine.compute(k);
    const wall = performance.now() - t0;
    const ev = k > 0 ? data.events[k - 1] : null;
    const res = k > 0 ? eventResults[k - 1] : null;

    const before = plan.windows; // same open, non-overdue invoices the plan settles
    console.log(`\n=== Step ${k}${ev ? ` · ${ev.id} ${ev.type}` : " · start"} · date ${date(ledger.date)}`);
    if (ev && res) console.log(`  ${res.status.toUpperCase()}: ${res.message}`);
    console.log(`  method ${plan.method}${plan.error ? ` — ERROR ${plan.error}` : ""}`);
    for (const s of plan.stats) {
      allTimes.push(s.timeMs);
      console.log(`  pass ${s.pass} ${s.status.padEnd(8)} value ${s.value.toFixed(2).padStart(14)}  ${s.timeMs.toFixed(0).padStart(5)} ms  (${s.variables} vars, ${s.binaries} binary, ${s.constraints} rows)`);
    }
    if (plan.stats.length === 0) console.log("  (plan reused from cache or nothing to solve)");
    console.log(`  replay+solve wall time ${wall.toFixed(0)} ms`);
    console.log(`  payments ${before.length} → ${payments(plan)}   cash ${sar(before.reduce((s, w) => s + w.amount, 0))} → ${sar(cash(plan))}`);
    for (const r of plan.rounds) {
      const pin = r.legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0);
      const ins = r.legs.filter((l) => l.dir === "in").map((l) => `${l.companyId} ${sar(l.amount)}`).join(", ");
      const outs = r.legs.filter((l) => l.dir === "out").map((l) => `${l.companyId} ${sar(l.amount)}`).join(", ");
      console.log(`  round ${r.date}: ${r.settlements.length} settlements, ${r.legs.length} payments, cash ${sar(pin)}`);
      console.log(`      pay in: ${ins || "—"}\n      pay out: ${outs || "—"}`);
    }
    const partial = plan.rounds.flatMap((r) => r.settlements.map((s) => s.invoiceId)).filter((id, i, a) => a.indexOf(id) !== i);
    if (partial.length) console.log(`  invoices split across rounds: ${[...new Set(partial)].join(", ")}`);
    if (plan.breaks.length) for (const b of plan.breaks) console.log(`  BREAK ${b.companyId} ${b.kind}: ${b.reason}`);
    const failed = plan.checks.filter((c) => !c.ok);
    failures += failed.length + plan.stats.filter((s) => s.status !== "Optimal").length + (plan.error ? 1 : 0);
    console.log(`  validator: ${plan.checks.length - failed.length}/${plan.checks.length} ✓${failed.map((c) => `\n    ✗ ${c.id} ${c.label}: ${c.detail}`).join("")}`);
    if (k > 0) {
      const changed = data.companies.map((c) => c.id).filter((c) => companySchedule(plan, c) !== companySchedule(previousPlan, c));
      console.log(`  changed companies: ${changed.join(", ") || "none"}`);
    }
    const partly = ledger.invoices.filter((i) => i.derivedStatus === "partly_settled").map((i) => i.id);
    const settled = ledger.invoices.filter((i) => i.derivedStatus === "settled").map((i) => i.id);
    if (settled.length || partly.length) console.log(`  ledger: ${settled.length} settled, ${partly.length} partly settled (${partly.join(", ")})`);
    if (ledger.escalations.length) console.log(`  escalations: ${ledger.escalations.map((e) => `${e.invoiceId} → ${e.authority}`).join("; ")}`);
  }

  const total = allTimes.reduce((s, t) => s + t, 0);
  console.log(`\nSolver passes: ${allTimes.length}, total ${total.toFixed(0)} ms, max ${Math.max(...allTimes).toFixed(0)} ms per pass.`);
  console.log(failures === 0 ? "All steps Optimal and all validator checks pass." : `${failures} problem(s) found.`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
