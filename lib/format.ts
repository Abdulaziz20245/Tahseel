// Display formatting. Implemented by hand rather than with Intl/toLocaleString so the server
// render and the browser always produce identical strings (no hydration mismatches).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Plain number with thousands separators; shows halalas only when present. */
export function num(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n * 100) / 100);
  const [i, f] = abs.toFixed(2).split(".");
  const body = f === "00" ? group(i) : `${group(i)}.${f}`;
  return (neg ? "-" : "") + body;
}

/** "SAR 1,250,000" (or "SAR 1,250,000.50" when there are halalas). */
export function sar(n: number): string {
  return n < 0 ? `-SAR ${num(-n)}` : `SAR ${num(n)}`;
}

/** Compact form for graph labels only: "SAR 1.25m", "SAR 805k", "SAR 950". */
export function sarCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (s: string) => s.replace(/\.?0+$/, "");
  let body: string;
  if (abs >= 999_500) body = trim((abs / 1_000_000).toFixed(2)) + "m";
  else if (abs >= 1_000) body = trim((abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)) + "k";
  else body = String(Math.round(abs));
  return `${sign}SAR ${body}`;
}

/** "2026-10-03" → "3 Oct 2026". */
export function date(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Fraction → percentage with one decimal (0.952 → "95.2%"); null/undefined/non-finite → "—". */
export function pct(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}
