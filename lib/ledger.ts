// Event engine — Claude.md §8.3. applyEvents() is pure: it always replays events 1..step from the
// base data (§8.8), so step k always yields the same ledger and "Back" never needs an undo.

import { addDays } from "./dates";
import { date as fmtDate, sar } from "./format";
import { checkInvoice } from "./schema";
import type {
  CompanyId,
  Constraint,
  Dataset,
  DerivedStatus,
  Escalation,
  Invoice,
  Ledger,
  LedgerInvoice,
  Plan,
  Round,
  ScenarioEvent,
} from "./types";

export const BANK_MISMATCH_REASON = "Paid mark not matched by bank";
export const AUTHORITY_DISPUTE = "MoJ — commercial court referral";
export const AUTHORITY_DISCIPLINE = "MoF — payment discipline unit";

export interface EventResult {
  step: number; // 1-based position of the event
  eventId: string;
  status: "applied" | "blocked" | "failed";
  message: string;
}

export interface ApplyOptions {
  /**
   * Returns the settlement plan for a ledger state (P04 injects the optimiser).
   * Without it, round execution is blocked because there is no plan to execute.
   */
  planAt?: (ledger: Ledger, step: number) => Plan | null;
}

export interface ApplyResult {
  ledger: Ledger;
  eventResults: EventResult[];
  plans: (Plan | null)[]; // plans[k] = plan after k events (empty without planAt)
}

// ---------- Derived fields ----------

function derive(inv: Invoice, settled: number, escalated: boolean): LedgerInvoice {
  let derivedStatus: DerivedStatus;
  let remaining = round2(inv.total - settled);
  if (inv.status === "paid_outside") {
    derivedStatus = "paid_outside";
    remaining = 0;
  } else if (escalated) derivedStatus = "escalated";
  else if (inv.status === "held") derivedStatus = "held";
  else if (remaining <= 0.005) derivedStatus = "settled";
  else if (settled > 0) derivedStatus = "partly_settled";
  else derivedStatus = "open";
  return { ...inv, settled, remaining, derivedStatus };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Open for optimisation: not settled, held, escalated or paid outside. */
export function isOpen(i: LedgerInvoice): boolean {
  return i.derivedStatus === "open" || i.derivedStatus === "partly_settled";
}

// ---------- Plan helpers used by round execution ----------

/** A company's schedule in a plan, as a comparable string (used to detect "plan changed"). */
export function companySchedule(plan: Plan | null, companyId: CompanyId, excludeDates?: Set<string>): string {
  if (!plan) return "";
  return plan.rounds
    .filter((r) => !excludeDates?.has(r.date))
    .flatMap((r) => r.legs.filter((l) => l.companyId === companyId).map((l) => `${r.date}:${l.dir}:${l.amount.toFixed(2)}`))
    .join("|");
}

function earliestRound(plan: Plan | null): Round | null {
  if (!plan || plan.rounds.length === 0) return null;
  return [...plan.rounds].sort((a, b) => a.date.localeCompare(b.date))[0];
}

// ---------- Engine ----------

export function initialLedger(base: Dataset): Ledger {
  return {
    date: base.settings.scenarioDate,
    invoices: base.invoices.map((i) => derive(i, 0, false)),
    constraints: base.constraints.map((c) => ({ ...c })),
    confirmations: {},
    executedRounds: [],
    escalations: [],
    log: [],
  };
}

export function applyEvents(base: Dataset, events: ScenarioEvent[], step: number, options: ApplyOptions = {}): ApplyResult {
  const last = Math.max(0, Math.min(step, events.length));
  let ledger = initialLedger(base);
  const eventResults: EventResult[] = [];

  // Plan history (only when an optimiser is injected): plans[k] is the plan after k events.
  const plans: (Plan | null)[] = [];
  const planFor = (k: number) => {
    if (!options.planAt) return null;
    if (plans[k] === undefined) plans[k] = options.planAt(ledger, k);
    return plans[k];
  };
  planFor(0);

  for (let k = 1; k <= last; k++) {
    const event = events[k - 1];
    const { next, result } = applyOne(base, ledger, event, k, planFor, plans);
    ledger = next;
    ledger.log = [...ledger.log, `E${String(k).padStart(2, "0")} ${result.status}: ${result.message}`];
    eventResults.push(result);
    planFor(k);
  }
  return { ledger, eventResults, plans: options.planAt ? plans : [] };
}

type Outcome = { next: Ledger; result: EventResult };

function applyOne(
  base: Dataset,
  ledger: Ledger,
  event: ScenarioEvent,
  k: number,
  planFor: (k: number) => Plan | null,
  plans: (Plan | null)[],
): Outcome {
  const done = (status: EventResult["status"], message: string, next: Ledger = ledger): Outcome => ({
    next,
    result: { step: k, eventId: event.id, status, message },
  });
  const companyName = (id: CompanyId) => base.companies.find((c) => c.id === id)?.name ?? id;
  const withInvoices = (invoices: LedgerInvoice[]): Ledger => ({ ...ledger, invoices });

  switch (event.type) {
    case "invoice_issued": {
      const inv = event.invoice;
      if (ledger.invoices.some((i) => i.id === inv.id)) return done("failed", `Invoice ${inv.id} already exists — event ignored.`);
      const problems = checkInvoice(inv, "events.json", new Set(base.companies.map((c) => c.id)), base.settings);
      if (problems.length > 0) return done("failed", `Invoice ${inv.id} rejected: ${problems.map((p) => p.rule).join("; ")}.`);
      const next = withInvoices([...ledger.invoices, derive({ ...inv, status: "open" }, 0, false)]);
      return done(
        "applied",
        `Fatoora reported invoice ${inv.id}: ${companyName(inv.buyerId)} owes ${companyName(inv.sellerId)} ${sar(inv.total)} (due ${fmtDate(inv.dueDate)}). It joins the network as open.`,
        next,
      );
    }

    case "payment_marked": {
      const target = ledger.invoices.find((i) => i.id === event.invoiceId);
      if (!target) return done("failed", `Invoice ${event.invoiceId} does not exist.`);
      if (!(isOpen(target) || target.derivedStatus === "held"))
        return done("failed", `Invoice ${target.id} is ${target.derivedStatus.replace("_", " ")} — nothing to mark.`);
      const updated: Invoice = event.bankMatch
        ? { ...target, status: "paid_outside" }
        : { ...target, status: "held", holdReason: BANK_MISMATCH_REASON };
      const next = withInvoices(
        ledger.invoices.map((i) => (i.id === target.id ? derive(updated, i.settled, isEscalated(ledger, i.id)) : i)),
      );
      return done(
        "applied",
        event.bankMatch
          ? `${target.id} was paid outside Tahseel and the bank confirmed it. It leaves the network.`
          : `${target.id} was marked paid, but no matching bank transfer was found. It is on hold until the sides agree and is excluded from settlement.`,
        next,
      );
    }

    case "constraint_set": {
      const c: Constraint = event.constraint;
      if (c.invoiceId) {
        const inv = ledger.invoices.find((i) => i.id === c.invoiceId);
        if (!inv) return done("failed", `Constraint refers to unknown invoice ${c.invoiceId}.`);
        if (inv.buyerId !== c.companyId) return done("failed", `Only the payer of ${inv.id} can set a time limit on it.`);
      }
      const same = (x: Constraint) => x.companyId === c.companyId && x.kind === c.kind && (x.invoiceId ?? "") === (c.invoiceId ?? "");
      const replaced = ledger.constraints.some(same);
      const next: Ledger = { ...ledger, constraints: [...ledger.constraints.filter((x) => !same(x)), { ...c }] };
      const what =
        c.kind === "weeklyCap"
          ? `a weekly cap of ${sar(c.amount ?? 0)}`
          : `${c.kind === "notBefore" ? "pay not before" : "pay not after"} ${fmtDate(c.date!)} on ${c.invoiceId}`;
      return done("applied", `${companyName(c.companyId)} ${replaced ? "updated" : "set"} ${what}: "${c.note}".`, next);
    }

    case "proposal_confirmed": {
      const ids = event.companyIds === "all" ? base.companies.map((c) => c.id) : event.companyIds;
      const confirmations = { ...ledger.confirmations };
      for (const id of ids) confirmations[id] = k;
      return done(
        "applied",
        event.companyIds === "all"
          ? "Every company confirmed its part of the current settlement proposal."
          : `${ids.map(companyName).join(", ")} confirmed their part of the current proposal.`,
        { ...ledger, confirmations },
      );
    }

    case "round_executed": {
      const plan = planFor(k - 1);
      if (plan === null) return done("blocked", "Optimiser not available yet — there is no plan to execute.");
      const round = earliestRound(plan);
      if (!round) return done("blocked", "The current plan has no rounds to execute.");

      // Each company in the round must have confirmed at or after the step its schedule last changed.
      const waiting = [...new Set(round.legs.map((l) => l.companyId))].filter((c) => {
        let changedAt = 0;
        for (let j = 1; j <= k - 1; j++) if (companySchedule(plans[j] ?? null, c) !== companySchedule(plans[j - 1] ?? null, c)) changedAt = j;
        const confirmedAt = ledger.confirmations[c];
        return confirmedAt === undefined || confirmedAt < changedAt;
      });
      if (waiting.length > 0)
        return done("blocked", `Blocked — awaiting confirmation from: ${waiting.map(companyName).join(", ")}.`);

      const settledNow = new Map<string, number>();
      for (const s of round.settlements) settledNow.set(s.invoiceId, (settledNow.get(s.invoiceId) ?? 0) + s.amount);
      const next: Ledger = {
        ...ledger,
        invoices: ledger.invoices.map((i) =>
          settledNow.has(i.id) ? derive(i, round2(i.settled + settledNow.get(i.id)!), isEscalated(ledger, i.id)) : i,
        ),
        executedRounds: [...ledger.executedRounds, { ...round, step: k }],
      };
      const cash = round.legs.filter((l) => l.dir === "in").reduce((s, l) => s + l.amount, 0);
      return done(
        "applied",
        `The hub executed the ${fmtDate(round.date)} round: ${round.settlements.length} invoice settlements, ${round.legs.length} transfers, ${sar(cash)} moved through the hub. The remainder is re-planned.`,
        next,
      );
    }

    case "date_advanced": {
      if (event.newDate <= ledger.date) return done("failed", `New date ${event.newDate} is not after ${ledger.date}.`);
      const newEscalations: Escalation[] = [];
      for (const i of ledger.invoices) {
        const eligible = isOpen(i) || i.derivedStatus === "held";
        if (!eligible || addDays(i.issueDate, base.settings.maxPaymentDays) >= event.newDate) continue;
        const dispute = i.status === "held" && !!i.holdReason && i.holdReason !== BANK_MISMATCH_REASON;
        newEscalations.push({
          invoiceId: i.id,
          payerId: i.buyerId,
          authority: dispute ? AUTHORITY_DISPUTE : AUTHORITY_DISCIPLINE,
          date: event.newDate,
          step: k,
        });
      }
      const escalated = new Set(newEscalations.map((e) => e.invoiceId));
      const next: Ledger = {
        ...ledger,
        date: event.newDate,
        invoices: ledger.invoices.map((i) => (escalated.has(i.id) ? derive(i, i.settled, true) : i)),
        escalations: [...ledger.escalations, ...newEscalations],
      };
      const tail =
        newEscalations.length === 0
          ? "No invoice passed the maximum payment period."
          : newEscalations.map((e) => `${e.invoiceId} passed ${base.settings.maxPaymentDays} days and was escalated to ${e.authority}`).join("; ") + ".";
      return done("applied", `The date moved to ${fmtDate(event.newDate)}. ${tail}`, next);
    }
  }
}

function isEscalated(ledger: Ledger, invoiceId: string): boolean {
  return ledger.escalations.some((e) => e.invoiceId === invoiceId);
}
