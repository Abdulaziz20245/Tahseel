// Date-only arithmetic on "YYYY-MM-DD" strings, in UTC so results never depend on the viewer's time zone.

const DAY_MS = 86_400_000;

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toDayNumber(s: string): number {
  return Math.round(Date.parse(s + "T00:00:00Z") / DAY_MS);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  return fromDayNumber(toDayNumber(s) + days);
}

/** b − a in whole days. */
export function daysBetween(a: string, b: string): number {
  return toDayNumber(b) - toDayNumber(a);
}
