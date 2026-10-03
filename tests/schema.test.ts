import { describe, expect, it } from "vitest";
import settings from "@/data/settings.json";
import companies from "@/data/companies.json";
import invoices from "@/data/invoices.json";
import constraints from "@/data/constraints.json";
import events from "@/data/events.json";
import { validateDataset } from "@/lib/schema";

const fresh = () => structuredClone({ settings, companies, invoices, constraints, events });

describe("validateDataset", () => {
  it("accepts the bundled scenario", () => {
    const r = validateDataset(fresh());
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("rejects an invoice whose VAT is not 15% of the net amount", () => {
    const raw = fresh();
    raw.invoices[0].vat += 1;
    const r = validateDataset(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({ file: "invoices.json", id: raw.invoices[0].id, rule: expect.stringMatching(/^vat must equal/) }),
      );
    }
  });

  it("rejects an invoice where seller and buyer are the same company", () => {
    const raw = fresh();
    raw.invoices[1].buyerId = raw.invoices[1].sellerId;
    const r = validateDataset(raw);
    expect(!r.ok && r.errors.some((e) => e.id === raw.invoices[1].id && e.rule.includes("sellerId must differ"))).toBe(true);
  });

  it("rejects a time limit set by a company that is not the invoice's payer", () => {
    const raw = fresh();
    const e02 = raw.events.find((e) => e.type === "constraint_set") as { constraint: { companyId: string } };
    e02.constraint.companyId = "SBG"; // ALF-2026-0102 is payable by ZML, not SBG
    const r = validateDataset(raw);
    expect(!r.ok && r.errors.some((e) => e.file === "events.json" && e.rule.includes("must be the invoice's buyer"))).toBe(true);
  });

  it("rejects a held invoice without a reason", () => {
    const raw = fresh();
    const held = raw.invoices.find((i) => i.status === "held")! as { holdReason?: string };
    delete held.holdReason;
    const r = validateDataset(raw);
    expect(!r.ok && r.errors.some((e) => e.rule.includes("held invoices require holdReason"))).toBe(true);
  });
});
