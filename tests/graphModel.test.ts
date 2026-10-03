import loadHighs from "highs";
import { beforeAll, describe, expect, it } from "vitest";
import { dataResult } from "@/lib/data";
import { buildGraphModel, type GraphModel } from "@/lib/graphModel";
import { computeMetrics } from "@/lib/metrics";
import { createEngine, type Engine, type StepResult } from "@/lib/optimizer/engine";

if (!dataResult.ok) throw new Error("bundled data invalid");
const data = dataResult.data;

let engine: Engine;
beforeAll(async () => {
  engine = createEngine(data, await loadHighs());
});

const modelAt = (k: number): { r: StepResult; g: GraphModel } => {
  const r = engine.compute(k);
  return { r, g: buildGraphModel({ data, ledger: r.ledger, plan: r.plan, previousPlan: r.previousPlan, changedAt: r.changedAt }) };
};

describe("buildGraphModel", () => {
  it(
    "at every step, hub edges sum to payments after and before-edge invoice counts sum to payments before",
    () => {
      for (let k = 0; k <= data.events.length; k++) {
        const { r, g } = modelAt(k);
        const { rows } = computeMetrics(r.ledger, r.plan, data.settings);
        const m = { payments: rows.payments, cash: rows.cash };
        expect(g.rounds.reduce((s, x) => s + x.hubEdges.length, 0)).toBe(m.payments.after);
        expect(g.pairEdges.reduce((s, e) => s + e.count, 0)).toBe(m.payments.before);
        // Each round's hub balances, and its pay-in equals the cash moved that day.
        for (const round of g.rounds) {
          const pin = round.hubEdges.filter((h) => h.dir === "in").reduce((s, h) => s + h.amount, 0);
          const pout = round.hubEdges.filter((h) => h.dir === "out").reduce((s, h) => s + h.amount, 0);
          expect(pin).toBeCloseTo(pout, 2);
          expect(round.payIn).toBeCloseTo(pin, 2);
        }
        expect(g.rounds.reduce((s, x) => s + x.payIn, 0)).toBeCloseTo(m.cash.after, 2);
        expect(g.pairEdges.reduce((s, e) => s + e.total, 0)).toBeCloseTo(m.cash.before, 2);
      }
    },
    120_000,
  );

  it("step 0: 12 companies, every pair edge has a round, and only the held invoice is a problem edge", () => {
    const { g } = modelAt(0);
    expect(g.companies).toHaveLength(12);
    expect(g.pairEdges.every((e) => e.roundDates.length >= 1)).toBe(true);
    expect(g.problemEdges.flatMap((e) => e.invoiceIds)).toEqual(["SCC-2026-0403"]);
    expect(g.companies.find((c) => c.id === "NSM")!.badges.cap).toBe(true);
    expect(g.companies.some((c) => c.badges.changed)).toBe(false);
  });

  it(
    "badges follow the story: changed after E01, cleared by E05's confirmation; escalation from step 7",
    () => {
      expect(modelAt(1).g.companies.some((c) => c.badges.changed)).toBe(true);
      expect(modelAt(2).g.companies.find((c) => c.id === "ZML")!.badges.timeLimit).toBe(true);
      expect(modelAt(5).g.companies.some((c) => c.badges.changed)).toBe(false);
      const s7 = modelAt(7).g;
      expect(s7.companies.find((c) => c.id === "ESE")!.badges.escalation).toBe(true);
      expect(s7.problemEdges.find((e) => e.invoiceIds.includes("SCC-2026-0403"))).toBeDefined();
    },
    120_000,
  );
});
