// npm run describe-data — prints the structure of the step-0 scenario so §8.5 can be checked
// before the optimiser exists. Plain arithmetic only; P04 re-checks event effects with the solver.
import { dataResult } from "../lib/data";
import { daysBetween } from "../lib/dates";
import type { Invoice } from "../lib/types";

if (!dataResult.ok) {
  console.error("Data invalid — run npm run validate.");
  process.exit(1);
}
const { settings, companies, invoices, constraints, events } = dataResult.data;
const T = settings.scenarioDate;
const sar = (n: number) => "SAR " + Math.round(n).toLocaleString("en-US");
const pad = (s: string | number, n: number) => String(s).padStart(n);

const open = invoices.filter((i) => i.status === "open");
const held = invoices.filter((i) => i.status === "held");

// ---- Per-company totals ----
console.log(`\nScenario date ${T}. Invoices: ${invoices.length} (${open.length} open, ${held.length} held).`);
console.log("\nPer company (open invoices, SAR incl. VAT)");
console.log("  id    incoming        outgoing        net             #in #out");
const net = new Map<string, number>();
for (const c of companies) {
  const inc = open.filter((i) => i.sellerId === c.id);
  const out = open.filter((i) => i.buyerId === c.id);
  const sIn = inc.reduce((s, i) => s + i.total, 0);
  const sOut = out.reduce((s, i) => s + i.total, 0);
  net.set(c.id, sIn - sOut);
  const flag = inc.length === 0 || out.length === 0 ? "  <-- missing in or out" : "";
  console.log(`  ${c.id.padEnd(5)} ${pad(sar(sIn), 15)} ${pad(sar(sOut), 15)} ${pad(sar(sIn - sOut), 15)} ${pad(inc.length, 4)} ${pad(out.length, 4)}${flag}`);
}

// ---- Cycles in the who-pays-whom graph (payer → payee), simple DFS, length ≤ 5 ----
function cyclesOf(list: Invoice[], maxLen = 5): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const i of list) {
    if (!adj.has(i.buyerId)) adj.set(i.buyerId, new Set());
    adj.get(i.buyerId)!.add(i.sellerId);
  }
  const nodes = [...new Set(list.flatMap((i) => [i.buyerId, i.sellerId]))].sort();
  const found: string[][] = [];
  // Each cycle is reported once, starting from its smallest id.
  for (const start of nodes) {
    const walk = (node: string, path: string[]) => {
      for (const next of adj.get(node) ?? []) {
        if (next === start && path.length >= 2) found.push([...path]);
        else if (next > start && !path.includes(next) && path.length < maxLen) walk(next, [...path, next]);
      }
    };
    walk(start, [start]);
  }
  return found.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
}
const showCycles = (label: string, cycles: string[][]) => {
  const byLen = new Map<number, number>();
  for (const c of cycles) byLen.set(c.length, (byLen.get(c.length) ?? 0) + 1);
  console.log(`\n${label}: ${cycles.length} (by length: ${[...byLen].map(([l, n]) => `${l}→${n}`).join(", ")})`);
  for (const c of cycles.filter((c) => c.length <= 4)) console.log(`  ${c.join(" → ")} → ${c[0]}`);
  if (cycles.some((c) => c.length > 4)) console.log(`  (+ ${cycles.filter((c) => c.length > 4).length} of length 5 not listed)`);
};
showCycles("Directed cycles at step 0 (payer → payee, length ≤ 5)", cyclesOf(open));

const e01 = events.find((e) => e.type === "invoice_issued");
if (e01 && e01.type === "invoice_issued") {
  const before = new Set(cyclesOf(open).map((c) => c.join()));
  const created = cyclesOf([...open, e01.invoice]).filter((c) => !before.has(c.join()));
  console.log(`\n${e01.id} (${e01.invoice.id}, ${e01.invoice.buyerId} pays ${e01.invoice.sellerId}) creates ${created.length} new cycle(s), e.g.:`);
  for (const c of created.slice(0, 4)) console.log(`  ${c.join(" → ")} → ${c[0]}`);
}

// ---- Longest simple chain (path) ----
{
  const adj = new Map<string, string[]>();
  for (const i of open) adj.set(i.buyerId, [...new Set([...(adj.get(i.buyerId) ?? []), i.sellerId])].sort());
  let best: string[] = [];
  const walk = (path: string[]) => {
    if (path.length > best.length) best = path;
    if (path.length >= 6) return; // a chain of 6 is plenty to show
    for (const n of adj.get(path.at(-1)!) ?? []) if (!path.includes(n)) walk([...path, n]);
  };
  for (const c of companies) walk([c.id]);
  console.log(`\nLongest chain found (capped at 6): ${best.join(" → ")} (${best.length} companies)`);
}

// ---- Due-date spread in 7-day weeks from the scenario date ----
console.log("\nDue dates of open invoices by week (week 1 starts on the scenario date; overdue counted in week 1)");
const weeks = new Map<number, number>();
for (const i of open) {
  const w = Math.max(0, Math.floor(daysBetween(T, i.dueDate) / 7)) + 1;
  weeks.set(w, (weeks.get(w) ?? 0) + 1);
}
for (const [w, n] of [...weeks].sort((a, b) => a[0] - b[0])) console.log(`  week ${w}: ${n}`);
console.log(`  distinct weeks: ${weeks.size}; earliest due ${open.map((i) => i.dueDate).sort()[0]}, latest ${open.map((i) => i.dueDate).sort().at(-1)}`);

// ---- Held, constraints ----
console.log("\nHeld invoices");
for (const i of held) console.log(`  ${i.id} issued ${i.issueDate}, ${i.buyerId} pays ${i.sellerId}, ${sar(i.total)} — ${i.holdReason}`);
console.log("\nConstraints at step 0");
for (const c of constraints) console.log(`  ${c.id}: ${c.companyId} ${c.kind}${c.amount ? " " + sar(c.amount) : ""}${c.date ? " " + c.date : ""} — ${c.note}`);

// ---- Theoretical maximum set-off (§6) ----
const cashBefore = open.reduce((s, i) => s + i.total, 0);
const positiveNets = [...net.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
console.log("\nTheoretical maximum (all open invoices settled on one day)");
console.log(`  cash before (Σ open)          ${sar(cashBefore)}  in ${open.length} payments`);
console.log(`  minimum cash (Σ positive nets) ${sar(positiveNets)}`);
console.log(`  max set-off                    ${sar(cashBefore - positiveNets)} (${(((cashBefore - positiveNets) / cashBefore) * 100).toFixed(1)}% of cash before)`);

// ---- Events ----
console.log(`\nEvents (${events.length})`);
for (const e of events) console.log(`  ${e.id} ${e.type.padEnd(18)} ${e.title}`);
