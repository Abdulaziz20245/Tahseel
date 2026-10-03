import loadHighs from "highs";
import { beforeAll, describe, expect, it } from "vitest";
import { companyView } from "@/lib/allocation";
import { dataResult } from "@/lib/data";
import { initialLedger } from "@/lib/ledger";
import { companyPositions } from "@/lib/metrics";
import { createEngine } from "@/lib/optimizer/engine";
import { solvePlan, type HighsLike } from "@/lib/optimizer/solve";
import type { Dataset, Invoice } from "@/lib/types";

let highs: HighsLike;
beforeAll(async () => {
  highs = await loadHighs();
});

const inv = (id: string, s: string, b: string, issue: string, due: string, ex: number): Invoice => ({
  id, fatooraUuid: "00000000-0000-4000-8000-000000000000", sellerId: s, buyerId: b, issueDate: issue, dueDate: due,
  amountExVat: ex, vat: ex * 0.15, total: ex * 1.15, status: "open", description: "t",
});

describe("companyView", () => {
  it("§8.7: SBG's view of ZML-2026-0101 is SAR 805,000 set-off and SAR 115,000 paid to hub", () => {
    const ledger = initialLedger({
      settings: { scenarioDate: "2026-10-03", maxPaymentDays: 60, vatRate: 0.15, financingRateIllustrative: 0.08, currency: "SAR" },
      companies: [], constraints: [], events: [],
      invoices: [
        inv("ZML-2026-0101", "ZML", "SBG", "2026-09-01", "2026-10-15", 800000),
        inv("ALF-2026-0102", "ALF", "ZML", "2026-09-05", "2026-10-15", 600000),
        inv("SBG-2026-0103", "SBG", "ALF", "2026-09-10", "2026-10-20", 500000),
        inv("SBG-2026-0104", "SBG", "ZML", "2026-09-12", "2026-10-12", 200000),
      ],
    } as Dataset);
    const v = companyView("SBG", ledger, solvePlan(ledger, highs, 60, "2026-10-03"), {});
    const row = v.rows.find((r) => r.invoice.id === "ZML-2026-0101")!;
    expect([row.setOff, row.hub]).toEqual([805000, 115000]);
    expect(v.payHub).toBe(115000);
  });

  it(
    "every company, every step: set-off + hub = settled amounts; pay-hub = pay-in legs; positions match the graph",
    () => {
      if (!dataResult.ok) throw new Error("data");
      const data = dataResult.data;
      const engine = createEngine(data, highs);
      for (let k = 0; k <= data.events.length; k++) {
        const { ledger, plan, changedAt } = engine.compute(k);
        const pos = companyPositions(ledger);
        for (const c of data.companies) {
          const v = companyView(c.id, ledger, plan, changedAt);
          const settled = plan.rounds.flatMap((r) => r.settlements).filter((s) => v.rows.some((x) => x.invoice.id === s.invoiceId)).reduce((s, x) => s + x.amount, 0);
          expect(v.rows.reduce((s, r) => s + r.setOff + r.hub, 0)).toBeCloseTo(settled, 2);
          const legs = plan.rounds.flatMap((r) => r.legs).filter((l) => l.companyId === c.id && l.dir === "in").reduce((s, l) => s + l.amount, 0);
          expect(v.payHub).toBeCloseTo(legs, 2);
          expect(v.incoming).toBe(pos.get(c.id)?.incoming ?? 0);
        }
        if (k === 2) {
          const z = companyView("ZML", ledger, plan, changedAt);
          expect(z.constraints.some((x) => x.kind === "notBefore")).toBe(true);
          expect(z.status).toEqual({ changed: true, changedAt: 2 });
        }
        if (k === 5) expect(companyView("ZML", ledger, plan, changedAt).status.changed).toBe(false);
      }
    },
    120_000,
  );
});
