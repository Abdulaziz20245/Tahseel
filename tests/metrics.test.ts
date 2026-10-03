import loadHighs from "highs";
import { beforeAll, describe, expect, it } from "vitest";
import { dataResult } from "@/lib/data";
import { initialLedger } from "@/lib/ledger";
import { change, computeMetrics, FINANCING_LABEL, financingWalk } from "@/lib/metrics";
import { createEngine } from "@/lib/optimizer/engine";
import { solvePlan, type HighsLike } from "@/lib/optimizer/solve";
import type { Dataset, Invoice, Settings } from "@/lib/types";

let highs: HighsLike;
beforeAll(async () => {
  highs = await loadHighs();
});

const T = "2026-10-03";
const settings: Settings = { scenarioDate: T, maxPaymentDays: 60, vatRate: 0.15, financingRateIllustrative: 0.08, currency: "SAR" };

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
const ledgerOf = (invoices: Invoice[]) => initialLedger({ settings, companies: [], invoices, constraints: [], events: [] } as Dataset);

describe("§8.7 example", () => {
  const example = [
    inv("ZML-2026-0101", "ZML", "SBG", "2026-09-01", "2026-10-15", 800000),
    inv("ALF-2026-0102", "ALF", "ZML", "2026-09-05", "2026-10-15", 600000),
    inv("SBG-2026-0103", "SBG", "ALF", "2026-09-10", "2026-10-20", 500000),
    inv("SBG-2026-0104", "SBG", "ZML", "2026-09-12", "2026-10-12", 200000),
  ];

  it("payments 4 → 2, cash 2,415,000 → 115,000, set-off 95.2%, theoretical maximum 100%", () => {
    const ledger = ledgerOf(example);
    const m = computeMetrics(ledger, solvePlan(ledger, highs, 60, T), settings);
    expect(m.planAvailable).toBe(true);
    expect([m.rows.payments.before, m.rows.payments.after]).toEqual([4, 2]);
    expect([m.rows.cash.before, m.rows.cash.after]).toEqual([2415000, 115000]);
    expect(m.rows.setOff.afterValue).toBeCloseTo(0.9524, 4);
    expect(m.rows.theoreticalShare.afterValue).toBeCloseTo(1, 10);
    expect(m.minCash).toBe(115000);
    expect(change(m.rows.payments)).toEqual({ abs: -2, pct: -0.5, direction: "better" });
    expect(m.rounds).toEqual([{ date: "2026-10-10", invoices: 4, gross: 2415000, setOff: 2300000, hubCash: 115000, payments: 2 }]);
  });
});

describe("zero baseline", () => {
  it("no open invoices gives zeros and null percentages, never NaN or ∞", () => {
    const ledger = ledgerOf([]);
    const m = computeMetrics(ledger, solvePlan(ledger, highs, 60, T), settings);
    for (const k of m.order) {
      const r = m.rows[k];
      for (const v of [r.before, r.after]) expect(Number.isFinite(v)).toBe(true);
      expect(change(r).pct).toBeNull();
    }
    expect(m.rows.setOff.afterValue).toBeNull();
    expect(m.rows.theoreticalShare.afterValue).toBeNull();
  });

  it("a worse result is reported as worse, not hidden", () => {
    expect(change({ before: 10, after: 12, better: "lower" })).toEqual({ abs: 2, pct: 0.2, direction: "worse" });
    expect(change({ before: 10, after: 10, better: "lower" }).direction).toBe("equal");
  });
});

describe("financing walk", () => {
  // Hand example. A owes B 100 due 5 Oct; B owes A 60 due 8 Oct. Horizon 3–8 Oct, rate 8%.
  // A: 3–4 Oct 0; 5–7 Oct −100 (3 days, shortfall 100); 8 Oct −40 (shortfall 40). Need 100,
  //    cost = (3 × 100 + 40) × 0.08 ÷ 365. B: +100 then +40, never short.
  it("matches the hand-computed 2-company example", () => {
    const flows = [
      { companyId: "A", date: "2026-10-05", amount: -100 },
      { companyId: "B", date: "2026-10-05", amount: 100 },
      { companyId: "B", date: "2026-10-08", amount: -60 },
      { companyId: "A", date: "2026-10-08", amount: 60 },
    ];
    const r = financingWalk(flows, T, "2026-10-08", 0.08);
    expect(r.need).toBe(100);
    expect(r.cost).toBeCloseTo(Math.round(((340 * 0.08) / 365) * 100) / 100, 10);
    expect(r.perCompany.get("B")).toEqual({ need: 0, cost: 0 });
  });

  it("netting both invoices on 8 Oct removes the need except A's net 40", () => {
    const flows = [
      { companyId: "A", date: "2026-10-08", amount: -40 },
      { companyId: "B", date: "2026-10-08", amount: 40 },
    ];
    const r = financingWalk(flows, T, "2026-10-08", 0.08);
    expect(r.need).toBe(40);
    expect(r.cost).toBeCloseTo(Math.round(((40 * 0.08) / 365) * 100) / 100, 10);
  });

  it("past-due flows happen on the first day of the walk", () => {
    const r = financingWalk([{ companyId: "A", date: "2026-09-01", amount: -10 }], T, T, 0.08);
    expect(r.need).toBe(10);
  });
});

describe("full scenario", () => {
  if (!dataResult.ok) throw new Error("bundled data invalid");
  const data = dataResult.data;

  it(
    "every step: theoretical maximum ≤ 100%, financing labelled illustrative, values finite",
    () => {
      const engine = createEngine(data, highs);
      for (let k = 0; k <= data.events.length; k++) {
        const { ledger, plan } = engine.compute(k);
        const m = computeMetrics(ledger, plan, data.settings);
        expect(m.rows.theoreticalShare.afterValue ?? 0).toBeLessThanOrEqual(1 + 1e-9);
        expect(m.rows.financingCost.illustrative).toBe(FINANCING_LABEL);
        expect(m.rows.cash.after).toBeGreaterThanOrEqual(m.minCash - 0.01); // nobody beats the one-day bound
        for (const key of m.order) expect(Number.isFinite(m.rows[key].after)).toBe(true);
        expect(m.rounds.reduce((s, r) => s + r.hubCash, 0)).toBeCloseTo(m.rows.cash.after, 2);
      }
      const s7 = computeMetrics(engine.compute(7).ledger, engine.compute(7).plan, data.settings);
      expect(s7.rows.escalated.after).toBe(1);
      expect(s7.overdue.map((o) => o.invoiceId)).toContain("SCC-2026-0403");
    },
    120_000,
  );
});
