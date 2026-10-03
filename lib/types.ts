// Domain types — Claude.md §8.2. Stored types mirror the Zod schemas in schema.ts.

// ---------- Stored (JSON) ----------

export type CompanyId = string; // 2–5 uppercase letters, e.g. "SBG"

export type Sector =
  | "Contracting"
  | "Steel"
  | "Cement & Concrete"
  | "Electrical"
  | "Building Materials"
  | "Food"
  | "Retail";

export interface Settings {
  scenarioDate: string; // YYYY-MM-DD
  maxPaymentDays: number;
  vatRate: number;
  financingRateIllustrative: number;
  currency: "SAR";
}

export interface Company {
  id: CompanyId;
  name: string; // real Saudi firm name [D1]; everything else about it is synthetic
  shortName: string; // ≤ 18 chars, for node labels
  sector: Sector;
  city: string; // best-effort HQ city
  vatNumber: string; // FAKE: 15 digits, starts and ends with "3"
  crNumber: string; // FAKE: 10 digits
  x: number; // fixed graph position
  y: number;
}

export type InvoiceStatus = "open" | "held" | "paid_outside"; // settled / partly_settled / escalated are derived

export interface Invoice {
  id: string; // e.g. "SBG-2026-0107" (seller prefix)
  fatooraUuid: string; // FAKE UUID v4
  sellerId: CompanyId; // payee
  buyerId: CompanyId; // payer
  issueDate: string;
  dueDate: string;
  amountExVat: number; // whole SAR, multiple of 100
  vat: number; // amountExVat * 0.15
  total: number; // amountExVat + vat
  status: InvoiceStatus;
  holdReason?: string; // required when status = "held"
  description: string;
}

export type ConstraintKind = "notBefore" | "notAfter" | "weeklyCap";

export interface Constraint {
  id: string;
  companyId: CompanyId;
  kind: ConstraintKind;
  invoiceId?: string; // notBefore / notAfter only; the company must be the invoice's buyer
  date?: string; // notBefore / notAfter
  amount?: number; // weeklyCap, SAR
  note: string;
}

export type ScenarioEvent =
  | { id: string; type: "invoice_issued"; title: string; invoice: Invoice }
  | { id: string; type: "payment_marked"; title: string; invoiceId: string; bankMatch: boolean }
  | { id: string; type: "constraint_set"; title: string; constraint: Constraint }
  | { id: string; type: "proposal_confirmed"; title: string; companyIds: CompanyId[] | "all" }
  | { id: string; type: "round_executed"; title: string } // executes the earliest round of the current plan
  | { id: string; type: "date_advanced"; title: string; newDate: string };

export interface Dataset {
  settings: Settings;
  companies: Company[];
  invoices: Invoice[];
  constraints: Constraint[];
  events: ScenarioEvent[];
}

export interface DataError {
  file: string; // e.g. "invoices.json"
  id: string; // offending record id, or "-" when not attributable
  rule: string;
}

export type DataResult = { ok: true; data: Dataset } | { ok: false; errors: DataError[] };

// ---------- Derived (never stored) ----------

export type DerivedStatus =
  | "open"
  | "partly_settled"
  | "settled"
  | "held"
  | "escalated"
  | "paid_outside";

export interface LedgerInvoice extends Invoice {
  settled: number;
  remaining: number;
  derivedStatus: DerivedStatus;
}

export interface Settlement {
  invoiceId: string;
  amount: number;
}

export interface Leg {
  companyId: CompanyId;
  dir: "in" | "out"; // "in" = company pays the hub; "out" = hub pays the company
  amount: number;
}

export interface Round {
  date: string;
  settlements: Settlement[];
  legs: Leg[];
}

export interface ExecutedRound extends Round {
  step: number; // event step at which it was executed
}

export interface Escalation {
  invoiceId: string;
  payerId: CompanyId;
  authority: string;
  date: string;
  step: number;
}

export interface Ledger {
  date: string;
  invoices: LedgerInvoice[];
  constraints: Constraint[];
  confirmations: Record<CompanyId, number>; // step at which the company last confirmed
  executedRounds: ExecutedRound[];
  escalations: Escalation[];
  log: string[];
}

export interface ConstraintBreak {
  constraintId?: string;
  companyId: CompanyId;
  invoiceId?: string;
  kind: ConstraintKind;
  reason: string;
  amount?: number; // e.g. SAR above a weekly cap
}

export interface PassStat {
  pass: 0 | 1 | 2;
  objective: string;
  status: string;
  value: number;
  timeMs: number;
  variables: number;
  binaries: number;
  constraints: number;
}

export interface CheckResult {
  id: number;
  label: string;
  ok: boolean;
  detail?: string;
}

/** Settlement window of one open invoice (§7.3), after any constraint relaxation. */
export interface InvoiceWindow {
  invoiceId: string;
  payerId: CompanyId;
  payeeId: CompanyId;
  amount: number; // remaining SAR to settle
  issueDate: string;
  earliest: string;
  latest: string;
  latestMax: string; // issue + max period
}

export interface Plan {
  rounds: Round[];
  breaks: ConstraintBreak[];
  stats: PassStat[];
  checks: CheckResult[];
  method: "mip" | "heuristic" | "none";
  windows: InvoiceWindow[];
  days: string[]; // candidate settlement days
  overdue: string[]; // open invoices past the max period, excluded from the plan
  error?: string; // set when no valid plan could be produced ("Plan invalid")
}

export interface MetricPair {
  before: number;
  after: number;
}

// One field per row of §6; the full shape is defined with metrics.ts in P06.
export type Metrics = Record<string, MetricPair>;
