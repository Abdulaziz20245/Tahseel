import loadHighs from "highs";
import { beforeAll, describe, expect, it } from "vitest";
import { dataResult } from "@/lib/data";
import { initialLedger } from "@/lib/ledger";
import { createEngine } from "@/lib/optimizer/engine";
import { heuristicPlan } from "@/lib/optimizer/heuristic";
import { solvePlan, type HighsLike } from "@/lib/optimizer/solve";
import type { Constraint, Dataset, Invoice, Ledger, Plan } from "@/lib/types";

let highs: HighsLike;
beforeAll(async () => {
  highs = await loadHighs();
});

const T = "2026-10-03";

function inv(id: string, sellerId: string, buyerId: string, issueDate: string, dueDate: string, amountExVat: number): Invoice {
  return {
    id,
    fatooraUuid: "00000000-0000-4000-8000-000000000000",
    sellerId,
    buyerId,
    issueDate,
    dueDate,
    amountExVat,
    vat: amountExVat * 0.15,
    total: amountExVat * 1.15,
    status: "open",
    description: "test",
  };
}

function ledgerOf(invoices: Invoice[], constraints: Constraint[] = []): Ledger {
  const ds: Dataset = {
    settings: { scenarioDate: T, maxPaymentDays: 60, vatRate: 0.15, financingRateIllustrative: 0.08, currency: "SAR" },
    companies: [],
    invoices,
    constraints,
    events: [],
  };
  return initialLedger(ds);
}

const solve = (l: Ledger) => solvePlan(l, highs, 60, T);
const payments = (p: Plan) => p.rounds.reduce((s, r) => s + r.legs.length, 0);
const cash = (p: Plan) => p.rounds.flatMap((r) => r.legs).filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0);
const allOptimal = (p: Plan) => p.stats.every((s) => s.status === "Optimal");
const allChecksPass = (p: Plan) => p.checks.length === 7 && p.checks.every((c) => c.ok);

describe("Claude.md §8.7 example", () => {
  // Same four invoices; under the weekly round calendar (3, 10, 17 Oct …) the latest common round is 10 Oct.
  const example = [
    inv("ZML-2026-0101", "ZML", "SBG", "2026-09-01", "2026-10-15", 800000),
    inv("ALF-2026-0102", "ALF", "ZML", "2026-09-05", "2026-10-15", 600000),
    inv("SBG-2026-0103", "SBG", "ALF", "2026-09-10", "2026-10-20", 500000),
    inv("SBG-2026-0104", "SBG", "ZML", "2026-09-12", "2026-10-12", 200000),
  ];

  it("settles in one round with 2 payments and SAR 115,000 of cash", () => {
    const plan = solve(ledgerOf(example));
    expect(plan.method).toBe("mip");
    expect(allOptimal(plan)).toBe(true);
    expect(allChecksPass(plan)).toBe(true);
    expect(plan.rounds).toHaveLength(1);
    expect(plan.rounds[0].date).toBe("2026-10-10");
    expect(plan.rounds[0].legs).toEqual([
      { companyId: "ALF", dir: "out", amount: 115000 },
      { companyId: "SBG", dir: "in", amount: 115000 },
    ]);
    expect(plan.rounds[0].legs.some((l) => l.companyId === "ZML")).toBe(false);
    expect(payments(plan)).toBe(2);
    expect(cash(plan)).toBe(115000);
  });
});

describe("structure", () => {
  const cycle = [
    inv("AAA-2026-0001", "AAA", "BBB", "2026-09-01", "2026-10-12", 100000),
    inv("BBB-2026-0002", "BBB", "CCC", "2026-09-01", "2026-10-12", 100000),
    inv("CCC-2026-0003", "CCC", "AAA", "2026-09-01", "2026-10-30", 100000),
  ];

  it("a pure 3-cycle of equal amounts needs no payments at all", () => {
    const plan = solve(ledgerOf(cycle));
    expect(allOptimal(plan)).toBe(true);
    expect(allChecksPass(plan)).toBe(true);
    expect(payments(plan)).toBe(0);
    expect(plan.rounds).toHaveLength(1);
    expect(plan.rounds[0].settlements).toHaveLength(3);
  });

  it("a notBefore that splits the cycle adds a round and payments", () => {
    const nb: Constraint = { id: "C1", companyId: "AAA", kind: "notBefore", invoiceId: "CCC-2026-0003", date: "2026-10-13", note: "later" };
    const base = solve(ledgerOf(cycle));
    const split = solve(ledgerOf(cycle, [nb]));
    expect(allOptimal(split)).toBe(true);
    expect(allChecksPass(split)).toBe(true);
    expect(split.breaks).toEqual([]);
    expect(split.rounds.length).toBeGreaterThan(base.rounds.length);
    expect(payments(split)).toBeGreaterThan(payments(base));
    const day = split.rounds.find((r) => r.settlements.some((s) => s.invoiceId === "CCC-2026-0003"))!.date;
    expect(day >= "2026-10-13").toBe(true);
  });

  it("an impossible constraint is recorded as a break and the plan stays valid", () => {
    const nb: Constraint = { id: "C2", companyId: "BBB", kind: "notBefore", invoiceId: "AAA-2026-0001", date: "2026-11-20", note: "too late" };
    const plan = solve(ledgerOf(cycle, [nb]));
    expect(plan.breaks).toMatchObject([{ constraintId: "C2", kind: "notBefore", invoiceId: "AAA-2026-0001" }]);
    expect(allOptimal(plan)).toBe(true);
    expect(allChecksPass(plan)).toBe(true);
  });

  it("a binding weekly cap spreads a company's pay-ins over several weeks without breaking it", () => {
    const owes = [
      inv("AAA-2026-0011", "AAA", "BBB", "2026-09-01", "2026-10-30", 1000000),
      inv("CCC-2026-0012", "CCC", "BBB", "2026-09-01", "2026-10-30", 1000000),
    ];
    const cap: Constraint = { id: "CAP", companyId: "BBB", kind: "weeklyCap", amount: 1000000, note: "cap" };
    const plan = solve(ledgerOf(owes, [cap]));
    expect(allOptimal(plan)).toBe(true);
    expect(allChecksPass(plan)).toBe(true);
    expect(plan.breaks).toEqual([]);
    const pays = plan.rounds.flatMap((r) => r.legs.filter((l) => l.companyId === "BBB" && l.dir === "in"));
    expect(pays.length).toBe(3); // SAR 2.3m at most SAR 1m a week
    expect(pays.every((l) => l.amount <= 1000000.01)).toBe(true);
  });

  it("no open invoices gives an empty plan without solving", () => {
    const plan = solve(ledgerOf([]));
    expect(plan.method).toBe("none");
    expect(plan.rounds).toEqual([]);
    expect(plan.stats).toEqual([]);
  });

  it("the heuristic fallback produces a plan that passes the validator", () => {
    const plan = heuristicPlan(ledgerOf(cycle), 60, T);
    expect(plan.method).toBe("heuristic");
    expect(allChecksPass(plan)).toBe(true);
  });
});

describe("full scenario", () => {
  if (!dataResult.ok) throw new Error("bundled data invalid");
  const data = dataResult.data;

  it(
    "solves every step 0–8 to proven optimality with all validator checks passing",
    () => {
      const engine = createEngine(data, highs);
      const times: number[] = [];
      for (let k = 0; k <= data.events.length; k++) {
        const { plan } = engine.compute(k);
        expect(plan.error).toBeUndefined();
        expect(plan.method).toBe("mip");
        expect(plan.stats.map((s) => s.status)).toEqual(plan.stats.map(() => "Optimal"));
        expect(plan.checks.filter((c) => !c.ok)).toEqual([]);
        times.push(...plan.stats.map((s) => s.timeMs));
      }
      console.log(`full scenario: ${times.length} passes, max ${Math.max(...times).toFixed(0)} ms, total ${times.reduce((a, b) => a + b, 0).toFixed(0)} ms`);
    },
    120_000,
  );

  it(
    "step 6 executes the first round: invoices become settled, some only partly (partial set-off)",
    () => {
      const engine = createEngine(data, highs);
      const s6 = engine.compute(6);
      expect(s6.eventResults[5]).toMatchObject({ eventId: "E06", status: "applied" });
      expect(s6.ledger.executedRounds).toHaveLength(1);
      const statuses = s6.ledger.invoices.map((i) => i.derivedStatus);
      expect(statuses.filter((s) => s === "settled").length).toBeGreaterThan(0);
      expect(statuses.filter((s) => s === "partly_settled").length).toBeGreaterThan(0);
      // The executed round no longer appears in the new plan.
      expect(s6.plan.rounds.map((r) => r.date)).not.toContain(s6.ledger.executedRounds[0].date);
    },
    120_000,
  );

  it(
    "the heuristic also yields a valid plan on the full scenario",
    () => {
      const plan = heuristicPlan(initialLedger(data), 60, data.settings.scenarioDate);
      expect(plan.checks.filter((c) => !c.ok)).toEqual([]);
    },
  );
});
