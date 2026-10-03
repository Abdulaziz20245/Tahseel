import { describe, expect, it } from "vitest";
import { applyEvents, AUTHORITY_DISCIPLINE, AUTHORITY_DISPUTE, BANK_MISMATCH_REASON, isOpen } from "@/lib/ledger";
import { dataResult } from "@/lib/data";
import type { Company, Dataset, Invoice, Ledger, Plan, ScenarioEvent } from "@/lib/types";

// ---------- Fixture ----------

const company = (id: string): Company => ({
  id,
  name: `${id} Co`,
  shortName: id,
  sector: "Contracting",
  city: "Riyadh",
  vatNumber: "300000000000003",
  crNumber: "1000000000",
  x: 0,
  y: 0,
});

const invoice = (id: string, sellerId: string, buyerId: string, issueDate: string, dueDate: string, amountExVat: number, extra: Partial<Invoice> = {}): Invoice => ({
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
  ...extra,
});

function fixture(events: ScenarioEvent[]): Dataset {
  return {
    settings: { scenarioDate: "2026-10-03", maxPaymentDays: 60, vatRate: 0.15, financingRateIllustrative: 0.08, currency: "SAR" },
    companies: ["AAA", "BBB", "CCC"].map(company),
    invoices: [
      invoice("AAA-2026-0001", "AAA", "BBB", "2026-08-10", "2026-09-09", 100000), // old, open
      invoice("BBB-2026-0002", "BBB", "CCC", "2026-09-01", "2026-10-15", 200000),
      invoice("CCC-2026-0003", "CCC", "AAA", "2026-08-11", "2026-09-10", 50000, { status: "held", holdReason: "Sides disagree: wrong quantity" }),
      invoice("CCC-2026-0004", "CCC", "BBB", "2026-08-12", "2026-09-11", 30000),
    ],
    constraints: [],
    events,
  };
}

const find = (l: Ledger, id: string) => l.invoices.find((i) => i.id === id)!;
const run = (events: ScenarioEvent[], options = {}) => {
  const base = fixture(events);
  return applyEvents(base, base.events, events.length, options);
};

// ---------- Event types ----------

describe("invoice_issued", () => {
  it("adds a new open invoice", () => {
    const inv = invoice("AAA-2026-0009", "AAA", "CCC", "2026-10-01", "2026-10-31", 10000);
    const { ledger, eventResults } = run([{ id: "E1", type: "invoice_issued", title: "t", invoice: inv }]);
    expect(eventResults[0].status).toBe("applied");
    expect(find(ledger, inv.id)).toMatchObject({ derivedStatus: "open", settled: 0, remaining: 11500 });
  });

  it("fails on a duplicate invoice id and leaves the ledger unchanged", () => {
    const dup = invoice("AAA-2026-0001", "AAA", "CCC", "2026-10-01", "2026-10-31", 999900);
    const before = run([]).ledger;
    const { ledger, eventResults } = run([{ id: "E1", type: "invoice_issued", title: "t", invoice: dup }]);
    expect(eventResults[0].status).toBe("failed");
    expect(eventResults[0].message).toMatch(/already exists/);
    expect(ledger.invoices).toEqual(before.invoices);
  });

  it("fails on an invoice that breaks a data rule", () => {
    const bad = { ...invoice("AAA-2026-0010", "AAA", "CCC", "2026-10-01", "2026-10-31", 10000), vat: 1 };
    const { eventResults } = run([{ id: "E1", type: "invoice_issued", title: "t", invoice: bad }]);
    expect(eventResults[0].status).toBe("failed");
  });
});

describe("payment_marked", () => {
  it("with a bank match removes the invoice from the network", () => {
    const { ledger } = run([{ id: "E1", type: "payment_marked", title: "t", invoiceId: "BBB-2026-0002", bankMatch: true }]);
    expect(find(ledger, "BBB-2026-0002")).toMatchObject({ derivedStatus: "paid_outside", remaining: 0 });
    expect(isOpen(find(ledger, "BBB-2026-0002"))).toBe(false);
  });

  it("without a bank match puts the invoice on hold", () => {
    const { ledger } = run([{ id: "E1", type: "payment_marked", title: "t", invoiceId: "BBB-2026-0002", bankMatch: false }]);
    expect(find(ledger, "BBB-2026-0002")).toMatchObject({ derivedStatus: "held", holdReason: BANK_MISMATCH_REASON });
  });

  it("fails for an unknown invoice", () => {
    const { eventResults } = run([{ id: "E1", type: "payment_marked", title: "t", invoiceId: "NOPE", bankMatch: true }]);
    expect(eventResults[0].status).toBe("failed");
  });
});

describe("constraint_set", () => {
  const nb = (date: string): ScenarioEvent => ({
    id: "E" + date,
    type: "constraint_set",
    title: "t",
    constraint: { id: "C1", companyId: "CCC", kind: "notBefore", invoiceId: "BBB-2026-0002", date, note: "n" },
  });

  it("adds a constraint, and replaces one with the same company, kind and invoice", () => {
    const { ledger } = run([nb("2026-10-10"), nb("2026-10-12")]);
    expect(ledger.constraints).toHaveLength(1);
    expect(ledger.constraints[0].date).toBe("2026-10-12");
  });

  it("fails when the company is not the invoice's payer", () => {
    const { eventResults } = run([
      { id: "E1", type: "constraint_set", title: "t", constraint: { id: "C1", companyId: "AAA", kind: "notBefore", invoiceId: "BBB-2026-0002", date: "2026-10-10", note: "n" } },
    ]);
    expect(eventResults[0].status).toBe("failed");
  });
});

describe("proposal_confirmed", () => {
  it("stores the step at which each company confirmed", () => {
    const { ledger } = run([
      { id: "E1", type: "proposal_confirmed", title: "t", companyIds: ["AAA"] },
      { id: "E2", type: "proposal_confirmed", title: "t", companyIds: "all" },
    ]);
    expect(ledger.confirmations).toEqual({ AAA: 2, BBB: 2, CCC: 2 });
  });
});

describe("round_executed", () => {
  const plan: Plan = {
    method: "mip",
    breaks: [],
    stats: [],
    checks: [],
    windows: [],
    days: [],
    overdue: [],
    rounds: [
      {
        date: "2026-10-15",
        settlements: [{ invoiceId: "BBB-2026-0002", amount: 100000 }],
        legs: [
          { companyId: "CCC", dir: "in", amount: 100000 },
          { companyId: "BBB", dir: "out", amount: 100000 },
        ],
      },
      {
        date: "2026-10-05", // earliest round, listed second on purpose
        settlements: [{ invoiceId: "BBB-2026-0002", amount: 130000 }],
        legs: [
          { companyId: "CCC", dir: "in", amount: 130000 },
          { companyId: "BBB", dir: "out", amount: 130000 },
        ],
      },
    ],
  };
  const exec: ScenarioEvent = { id: "EX", type: "round_executed", title: "t" };
  const confirmAll: ScenarioEvent = { id: "EC", type: "proposal_confirmed", title: "t", companyIds: "all" };

  it("is blocked while no optimiser is wired in", () => {
    const { eventResults } = run([exec]);
    expect(eventResults[0]).toMatchObject({ status: "blocked", message: expect.stringMatching(/Optimiser not available yet/) });
  });

  it("is blocked until every company in the earliest round has confirmed", () => {
    const { ledger, eventResults } = run([exec], { planAt: () => plan });
    expect(eventResults[0].status).toBe("blocked");
    expect(eventResults[0].message).toMatch(/awaiting confirmation from: .*BBB Co.*CCC Co|CCC Co.*BBB Co/);
    expect(ledger.executedRounds).toHaveLength(0);
  });

  it("executes the earliest round once confirmed, leaving the invoice partly settled", () => {
    const { ledger, eventResults } = run([confirmAll, exec], { planAt: () => plan });
    expect(eventResults[1].status).toBe("applied");
    expect(ledger.executedRounds).toMatchObject([{ date: "2026-10-05", step: 2 }]);
    expect(find(ledger, "BBB-2026-0002")).toMatchObject({ settled: 130000, remaining: 100000, derivedStatus: "partly_settled" });
  });

  it("requires a new confirmation when a company's plan changed after it confirmed", () => {
    // Plan changes at step 2 (after the confirmation at step 1).
    const planAt = (_l: Ledger, step: number): Plan => (step < 2 ? plan : { ...plan, rounds: [{ ...plan.rounds[1], date: "2026-10-06" }] });
    const { eventResults } = run([confirmAll, { id: "EN", type: "proposal_confirmed", title: "t", companyIds: ["AAA"] }, exec], { planAt });
    expect(eventResults[2].status).toBe("blocked");
  });
});

describe("date_advanced", () => {
  it("escalates held and open invoices past the maximum period, with the right authority", () => {
    const { ledger, eventResults } = run([
      { id: "E1", type: "payment_marked", title: "t", invoiceId: "CCC-2026-0004", bankMatch: false },
      { id: "E2", type: "date_advanced", title: "t", newDate: "2026-10-12" },
    ]);
    expect(eventResults[1].status).toBe("applied");
    expect(ledger.date).toBe("2026-10-12");
    // issue + 60: 0001 → 10-09, 0003 → 10-10, 0004 → 10-11 (all before 10-12); 0002 → 10-31.
    const byId = Object.fromEntries(ledger.escalations.map((e) => [e.invoiceId, e]));
    expect(Object.keys(byId).sort()).toEqual(["AAA-2026-0001", "CCC-2026-0003", "CCC-2026-0004"]);
    expect(byId["CCC-2026-0003"]).toMatchObject({ authority: AUTHORITY_DISPUTE, payerId: "AAA", date: "2026-10-12", step: 2 });
    expect(byId["CCC-2026-0004"].authority).toBe(AUTHORITY_DISCIPLINE); // held only for a bank mismatch
    expect(byId["AAA-2026-0001"].authority).toBe(AUTHORITY_DISCIPLINE); // open, unpaid
    expect(find(ledger, "CCC-2026-0003").derivedStatus).toBe("escalated");
    expect(find(ledger, "BBB-2026-0002").derivedStatus).toBe("open");
  });

  it("does not escalate an invoice exactly at the maximum (issue + 60 = date)", () => {
    const { ledger } = run([{ id: "E1", type: "date_advanced", title: "t", newDate: "2026-10-09" }]);
    expect(ledger.escalations.map((e) => e.invoiceId)).not.toContain("AAA-2026-0001");
  });

  it("fails when the new date is not later", () => {
    const { eventResults } = run([{ id: "E1", type: "date_advanced", title: "t", newDate: "2026-10-03" }]);
    expect(eventResults[0].status).toBe("failed");
  });
});

// ---------- Replay on the real scenario ----------

describe("scenario replay", () => {
  if (!dataResult.ok) throw new Error("bundled data invalid");
  const data = dataResult.data;
  const at = (k: number) => applyEvents(data, data.events, k);

  it("is deterministic: the same step twice gives an equal ledger", () => {
    for (let k = 0; k <= data.events.length; k++) expect(at(k)).toEqual(at(k));
  });

  it("jumping to step 6 equals stepping there one event at a time", () => {
    let walked = at(0);
    for (let k = 1; k <= 6; k++) {
      const nextStep = at(k);
      expect(nextStep.eventResults.slice(0, k - 1)).toEqual(walked.eventResults); // earlier results never change
      walked = nextStep;
    }
    expect(walked).toEqual(at(6));
  });

  it("starts with 35 open invoices", () => {
    expect(at(0).ledger.invoices.filter(isOpen)).toHaveLength(35);
  });

  it("step 3 removes the invoice paid outside; step 4 puts one on hold; step 7 escalates the 2026-08-10 held invoice", () => {
    expect(at(3).ledger.invoices.find((i) => i.id === "YCC-2026-0213")!.derivedStatus).toBe("paid_outside");
    expect(at(3).ledger.invoices.filter(isOpen)).toHaveLength(35); // +1 from E01, −1 from E03

    expect(at(4).ledger.invoices.find((i) => i.id === "BPT-2026-0304")).toMatchObject({ derivedStatus: "held", holdReason: BANK_MISMATCH_REASON });

    expect(at(6).ledger.escalations).toHaveLength(0);
    const s7 = at(7).ledger;
    expect(s7.escalations).toEqual([
      { invoiceId: "SCC-2026-0403", payerId: "ESE", authority: AUTHORITY_DISPUTE, date: "2026-10-12", step: 7 },
    ]);
    expect(s7.invoices.find((i) => i.id === "SCC-2026-0403")!.issueDate).toBe("2026-08-10");
  });

  it("without an injected optimiser, round execution is blocked", () => {
    expect(at(6).eventResults[5]).toMatchObject({ eventId: "E06", status: "blocked" });
  });
});
