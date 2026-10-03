// Settlement windows and candidate days — Claude.md §7.3, with the weekly round calendar decided in
// P04: the hub settles on the current date and every 7 days from the base scenario date. An invoice
// can settle on any round day inside its window, so it is never settled after its due date.

import { addDays, daysBetween } from "../dates";
import { isOpen } from "../ledger";
import type { CompanyId, ConstraintBreak, InvoiceWindow, Ledger } from "../types";

export const ROUND_INTERVAL_DAYS = 7;

/** A weekly cap counts as exceeded only beyond this (one halala, plus floating-point slack). */
export const CAP_TOLERANCE = 0.015;

export interface WindowResult {
  windows: InvoiceWindow[]; // sorted by invoice id
  breaks: ConstraintBreak[];
  overdue: string[]; // open invoices already past issue + max period (excluded)
  days: string[]; // candidate days (round calendar), sorted
  caps: Map<CompanyId, number>; // weekly caps
}

/** Round days from `from` to `to` inclusive: `from` itself plus every 7th day counted from `anchor`. */
export function roundCalendar(anchor: string, from: string, to: string): string[] {
  const days = [from];
  const offset = ((daysBetween(anchor, from) % ROUND_INTERVAL_DAYS) + ROUND_INTERVAL_DAYS) % ROUND_INTERVAL_DAYS;
  let d = offset === 0 ? addDays(from, ROUND_INTERVAL_DAYS) : addDays(from, ROUND_INTERVAL_DAYS - offset);
  while (d <= to) {
    days.push(d);
    d = addDays(d, ROUND_INTERVAL_DAYS);
  }
  return days;
}

export function computeWindows(ledger: Ledger, maxPaymentDays: number, anchor: string): WindowResult {
  const T = ledger.date;
  const breaks: ConstraintBreak[] = [];
  const overdue: string[] = [];
  const windows: InvoiceWindow[] = [];

  const open = ledger.invoices.filter(isOpen).sort((a, b) => a.id.localeCompare(b.id));
  const horizon = open.reduce((m, i) => {
    const lm = addDays(i.issueDate, maxPaymentDays);
    return lm > m ? lm : m;
  }, T);
  const calendar = roundCalendar(anchor, T, horizon);
  const hasRoundIn = (earliest: string, latest: string) => calendar.some((d) => d >= earliest && d <= latest);

  for (const inv of open) {
    const latestMax = addDays(inv.issueDate, maxPaymentDays);
    if (latestMax < T) {
      overdue.push(inv.id);
      continue;
    }
    // Time limits are set by the payer on its own invoice.
    const nb = ledger.constraints.find((c) => c.kind === "notBefore" && c.invoiceId === inv.id && c.companyId === inv.buyerId);
    const na = ledger.constraints.find((c) => c.kind === "notAfter" && c.invoiceId === inv.id && c.companyId === inv.buyerId);
    const dueOrToday = inv.dueDate > T ? inv.dueDate : T;

    const window = (useNb: boolean, useNa: boolean) => {
      const earliest = useNb && nb?.date && nb.date > T ? nb.date : T;
      let latest = latestMax < dueOrToday ? latestMax : dueOrToday;
      if (useNa && na?.date && na.date < latest) latest = na.date;
      return { earliest, latest };
    };

    // Break as little as possible (D7): keep both limits if a round fits, else drop one, else both.
    // Without limits the window always contains today, which is a round day.
    const attempts: [boolean, boolean][] = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ];
    let chosen = window(false, false);
    for (const [useNb, useNa] of attempts) {
      const w = window(useNb, useNa);
      if (!hasRoundIn(w.earliest, w.latest)) continue;
      chosen = w;
      const dropped = [!useNb && nb ? nb : null, !useNa && na ? na : null].filter((c) => c !== null);
      for (const c of dropped)
        breaks.push({
          constraintId: c.id,
          companyId: c.companyId,
          invoiceId: inv.id,
          kind: c.kind,
          reason:
            c.kind === "notBefore"
              ? `"Not before ${c.date}" cannot be met: no settlement round falls between ${c.date} and ${w.latest}, when the invoice must settle (due date or ${maxPaymentDays}-day maximum). The limit was relaxed.`
              : `"Not after ${c.date}" cannot be met: no settlement round falls between ${w.earliest} and ${c.date}. The limit was relaxed.`,
        });
      break;
    }

    windows.push({
      invoiceId: inv.id,
      payerId: inv.buyerId,
      payeeId: inv.sellerId,
      amount: inv.remaining,
      issueDate: inv.issueDate,
      earliest: chosen.earliest,
      latest: chosen.latest,
      latestMax,
    });
  }

  // Only round days that some window can use.
  const days = calendar.filter((d) => windows.some((w) => d >= w.earliest && d <= w.latest));
  const caps = new Map<CompanyId, number>();
  for (const c of ledger.constraints) if (c.kind === "weeklyCap" && typeof c.amount === "number") caps.set(c.companyId, c.amount);

  return { windows, breaks, overdue, days, caps };
}

/** Days of `days` inside a window. */
export function daysInWindow(w: Pick<InvoiceWindow, "earliest" | "latest">, days: string[]): string[] {
  return days.filter((d) => d >= w.earliest && d <= w.latest);
}

/** 0-based 7-day bucket counted from the scenario date. */
export function weekOf(day: string, scenarioDate: string): number {
  return Math.floor(daysBetween(scenarioDate, day) / 7);
}
