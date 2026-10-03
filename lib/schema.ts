// Zod schemas for the stored JSON (Claude.md §8.2) plus cross-file checks (§8.5).
// validateDataset() is the single entry point used by data.ts, the validate script and tests.

import { z } from "zod";
import { addDays, isValidIsoDate } from "./dates";
import type {
  Company,
  Constraint,
  DataError,
  DataResult,
  Dataset,
  Invoice,
  ScenarioEvent,
  Settings,
} from "./types";

// ---------- Field schemas ----------

const isoDate = z.string().refine(isValidIsoDate, "must be a valid YYYY-MM-DD date");
const companyId = z.string().regex(/^[A-Z]{2,5}$/, "company id must be 2–5 uppercase letters");
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const settingsSchema = z.strictObject({
  scenarioDate: isoDate,
  maxPaymentDays: z.int().positive(),
  vatRate: z.number().min(0).max(1),
  financingRateIllustrative: z.number().min(0).max(1),
  currency: z.literal("SAR"),
});

export const companySchema = z.strictObject({
  id: companyId,
  name: z.string().min(1),
  shortName: z.string().min(1).max(18, "shortName must be ≤ 18 characters"),
  sector: z.enum([
    "Contracting",
    "Steel",
    "Cement & Concrete",
    "Electrical",
    "Building Materials",
    "Food",
    "Retail",
  ]),
  city: z.string().min(1),
  vatNumber: z.string().regex(/^3\d{13}3$/, "VAT number must match ^3\\d{13}3$ (fake)"),
  crNumber: z.string().regex(/^\d{10}$/, "CR number must be 10 digits (fake)"),
  x: z.number(),
  y: z.number(),
});

export const invoiceSchema = z
  .strictObject({
    id: z.string().regex(/^[A-Z]{2,5}-\d{4}-\d{4}$/, "invoice id must look like SBG-2026-0107"),
    fatooraUuid: z.string().regex(uuidV4, "fatooraUuid must be a UUID v4"),
    sellerId: companyId,
    buyerId: companyId,
    issueDate: isoDate,
    dueDate: isoDate,
    amountExVat: z.int().positive().multipleOf(100, "amountExVat must be a multiple of 100"),
    vat: z.number().nonnegative(),
    total: z.number().positive(),
    status: z.enum(["open", "held", "paid_outside"]),
    holdReason: z.string().min(1).optional(),
    description: z.string().min(1),
  })
  .refine((i) => i.status !== "held" || !!i.holdReason, {
    message: "held invoices require holdReason",
    path: ["holdReason"],
  });

export const constraintSchema = z
  .strictObject({
    id: z.string().min(1),
    companyId,
    kind: z.enum(["notBefore", "notAfter", "weeklyCap"]),
    invoiceId: z.string().optional(),
    date: isoDate.optional(),
    amount: z.number().optional(),
    note: z.string().min(1),
  })
  .superRefine((c, ctx) => {
    if (c.kind === "weeklyCap") {
      if (!(typeof c.amount === "number" && c.amount > 0))
        ctx.addIssue({ code: "custom", message: "weeklyCap requires amount > 0", path: ["amount"] });
      if (c.invoiceId)
        ctx.addIssue({ code: "custom", message: "weeklyCap must not name an invoice", path: ["invoiceId"] });
    } else {
      if (!c.invoiceId)
        ctx.addIssue({ code: "custom", message: `${c.kind} requires invoiceId`, path: ["invoiceId"] });
      if (!c.date) ctx.addIssue({ code: "custom", message: `${c.kind} requires date`, path: ["date"] });
    }
  });

export const eventSchema = z.discriminatedUnion("type", [
  z.strictObject({ id: z.string().min(1), type: z.literal("invoice_issued"), title: z.string().min(1), invoice: invoiceSchema }),
  z.strictObject({
    id: z.string().min(1),
    type: z.literal("payment_marked"),
    title: z.string().min(1),
    invoiceId: z.string().min(1),
    bankMatch: z.boolean(),
  }),
  z.strictObject({
    id: z.string().min(1),
    type: z.literal("constraint_set"),
    title: z.string().min(1),
    constraint: constraintSchema,
  }),
  z.strictObject({
    id: z.string().min(1),
    type: z.literal("proposal_confirmed"),
    title: z.string().min(1),
    companyIds: z.union([z.literal("all"), z.array(companyId).min(1)]),
  }),
  z.strictObject({ id: z.string().min(1), type: z.literal("round_executed"), title: z.string().min(1) }),
  z.strictObject({ id: z.string().min(1), type: z.literal("date_advanced"), title: z.string().min(1), newDate: isoDate }),
]);

// ---------- Validation ----------

export interface RawDataset {
  settings: unknown;
  companies: unknown;
  invoices: unknown;
  constraints: unknown;
  events: unknown;
}

function recordId(raw: unknown, index: PropertyKey | undefined): string {
  if (typeof index !== "number" || !Array.isArray(raw)) return "-";
  const item = raw[index] as { id?: unknown } | undefined;
  return typeof item?.id === "string" ? item.id : `#${index}`;
}

function shapeErrors(file: string, raw: unknown, error: z.ZodError, isArray: boolean): DataError[] {
  return error.issues.map((issue) => {
    const [first, ...rest] = issue.path;
    const id = isArray ? recordId(raw, first) : "-";
    const fieldPath = (isArray ? rest : issue.path).map(String).join(".");
    return { file, id, rule: fieldPath ? `${fieldPath}: ${issue.message}` : issue.message };
  });
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

export function checkInvoice(inv: Invoice, file: string, companyIds: Set<string>, settings: Settings): DataError[] {
  const errs: DataError[] = [];
  const err = (rule: string) => errs.push({ file, id: inv.id, rule });

  if (inv.sellerId === inv.buyerId) err("sellerId must differ from buyerId");
  if (!companyIds.has(inv.sellerId)) err(`sellerId ${inv.sellerId} is not a known company`);
  if (!companyIds.has(inv.buyerId)) err(`buyerId ${inv.buyerId} is not a known company`);
  if (!inv.id.startsWith(inv.sellerId + "-")) err(`id must start with the seller prefix "${inv.sellerId}-"`);

  // Rounded to the halala so floating-point noise in rate × amount cannot cause false failures.
  const expectedVat = Math.round(inv.amountExVat * settings.vatRate * 100) / 100;
  if (inv.vat !== expectedVat) err(`vat must equal amountExVat × ${settings.vatRate} (${expectedVat}), got ${inv.vat}`);
  if (inv.total !== inv.amountExVat + inv.vat) err(`total must equal amountExVat + vat (${inv.amountExVat + inv.vat}), got ${inv.total}`);

  if (inv.dueDate < inv.issueDate) err("dueDate must not be before issueDate");
  const latest = addDays(inv.issueDate, settings.maxPaymentDays);
  if (inv.dueDate > latest) err(`dueDate must be ≤ issueDate + ${settings.maxPaymentDays} days (${latest})`);
  return errs;
}

function checkConstraint(
  c: Constraint,
  file: string,
  id: string,
  companyIds: Set<string>,
  invoices: Map<string, Invoice>,
): DataError[] {
  const errs: DataError[] = [];
  if (!companyIds.has(c.companyId)) errs.push({ file, id, rule: `companyId ${c.companyId} is not a known company` });
  if (c.kind !== "weeklyCap" && c.invoiceId) {
    const inv = invoices.get(c.invoiceId);
    if (!inv) errs.push({ file, id, rule: `invoiceId ${c.invoiceId} does not exist at this point` });
    else if (inv.buyerId !== c.companyId)
      errs.push({ file, id, rule: `companyId must be the invoice's buyer (${inv.buyerId}); only the payer sets time limits` });
  }
  return errs;
}

export function validateDataset(raw: RawDataset): DataResult {
  const errors: DataError[] = [];

  const settingsP = settingsSchema.safeParse(raw.settings);
  const companiesP = z.array(companySchema).safeParse(raw.companies);
  const invoicesP = z.array(invoiceSchema).safeParse(raw.invoices);
  const constraintsP = z.array(constraintSchema).safeParse(raw.constraints);
  const eventsP = z.array(eventSchema).safeParse(raw.events);

  if (!settingsP.success) errors.push(...shapeErrors("settings.json", raw.settings, settingsP.error, false));
  if (!companiesP.success) errors.push(...shapeErrors("companies.json", raw.companies, companiesP.error, true));
  if (!invoicesP.success) errors.push(...shapeErrors("invoices.json", raw.invoices, invoicesP.error, true));
  if (!constraintsP.success) errors.push(...shapeErrors("constraints.json", raw.constraints, constraintsP.error, true));
  if (!eventsP.success) errors.push(...shapeErrors("events.json", raw.events, eventsP.error, true));

  // Cross-file checks need every file to have the right shape first.
  if (errors.length > 0 || !settingsP.success || !companiesP.success || !invoicesP.success || !constraintsP.success || !eventsP.success) {
    return { ok: false, errors };
  }

  const settings: Settings = settingsP.data;
  const companies: Company[] = companiesP.data;
  const invoices: Invoice[] = invoicesP.data;
  const constraints: Constraint[] = constraintsP.data;
  const events = eventsP.data as ScenarioEvent[];

  // Companies
  const companyIds = new Set(companies.map((c) => c.id));
  for (const id of duplicates(companies.map((c) => c.id))) errors.push({ file: "companies.json", id, rule: "duplicate company id" });
  for (const v of duplicates(companies.map((c) => c.vatNumber))) errors.push({ file: "companies.json", id: v, rule: "duplicate VAT number" });
  for (const v of duplicates(companies.map((c) => c.crNumber))) errors.push({ file: "companies.json", id: v, rule: "duplicate CR number" });

  // Invoices (step 0)
  for (const inv of invoices) {
    errors.push(...checkInvoice(inv, "invoices.json", companyIds, settings));
    if (inv.issueDate > settings.scenarioDate)
      errors.push({ file: "invoices.json", id: inv.id, rule: `issueDate must not be after the scenario date (${settings.scenarioDate})` });
  }
  const allInvoices = [...invoices, ...events.flatMap((e) => (e.type === "invoice_issued" ? [e.invoice] : []))];
  for (const id of duplicates(allInvoices.map((i) => i.id)))
    errors.push({ file: "invoices.json / events.json", id, rule: "duplicate invoice id" });
  for (const u of duplicates(allInvoices.map((i) => i.fatooraUuid)))
    errors.push({ file: "invoices.json / events.json", id: u, rule: "duplicate Fatoora UUID" });

  // Constraints (step 0)
  const known = new Map(invoices.map((i) => [i.id, i]));
  for (const id of duplicates(constraints.map((c) => c.id))) errors.push({ file: "constraints.json", id, rule: "duplicate constraint id" });
  for (const c of constraints) errors.push(...checkConstraint(c, "constraints.json", c.id, companyIds, known));

  // Events, walked in order so references and dates are checked against the state at that point.
  for (const id of duplicates(events.map((e) => e.id))) errors.push({ file: "events.json", id, rule: "duplicate event id" });
  let date = settings.scenarioDate;
  for (const e of events) {
    const err = (rule: string) => errors.push({ file: "events.json", id: e.id, rule });
    switch (e.type) {
      case "invoice_issued":
        for (const x of checkInvoice(e.invoice, "events.json", companyIds, settings)) err(`invoice ${e.invoice.id}: ${x.rule}`);
        if (e.invoice.issueDate > date) err(`invoice ${e.invoice.id}: issueDate must not be after the scenario date at this event (${date})`);
        if (e.invoice.status !== "open") err(`invoice ${e.invoice.id}: newly issued invoices must be "open"`);
        known.set(e.invoice.id, e.invoice);
        break;
      case "payment_marked":
        if (!known.has(e.invoiceId)) err(`invoiceId ${e.invoiceId} does not exist at this point`);
        break;
      case "constraint_set":
        for (const x of checkConstraint(e.constraint, "events.json", e.id, companyIds, known)) err(x.rule);
        break;
      case "proposal_confirmed":
        if (e.companyIds !== "all")
          for (const c of e.companyIds) if (!companyIds.has(c)) err(`companyId ${c} is not a known company`);
        break;
      case "date_advanced":
        if (e.newDate <= date) err(`newDate ${e.newDate} must be later than the previous date (${date})`);
        date = e.newDate;
        break;
      case "round_executed":
        break;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const data: Dataset = { settings, companies, invoices, constraints, events };
  return { ok: true, data };
}
