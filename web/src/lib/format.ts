import { DECIMALS, UNIT } from "./config";

/** Convert a human amount ("12.5") to base units (stroops-like i128). */
export function toBaseUnits(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!s || Number.isNaN(Number(s))) return 0n;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const fracPadded = (frac + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  const value = BigInt(whole || "0") * UNIT + BigInt(fracPadded || "0");
  return neg ? -value : value;
}

/** Convert base units to a display string with grouped thousands. */
export function fromBaseUnits(
  units: bigint | string | number,
  opts: { maxFractionDigits?: number; grouped?: boolean } = {},
): string {
  const { maxFractionDigits = 2, grouped = true } = opts;
  const v = typeof units === "bigint" ? units : BigInt(Math.trunc(Number(units)));
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / UNIT;
  const frac = abs % UNIT;

  let fracStr = frac.toString().padStart(DECIMALS, "0").slice(0, maxFractionDigits);
  fracStr = fracStr.replace(/0+$/, "");

  const wholeStr = grouped
    ? whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : whole.toString();

  return `${neg ? "-" : ""}${wholeStr}${fracStr ? "." + fracStr : ""}`;
}

/** Money display, always with the asset code. */
export function money(units: bigint, code = "rUSDC"): string {
  return `${fromBaseUnits(units)} ${code}`;
}

/** Basis points -> percent label, e.g. 2000 -> "20%". */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toString().replace(/\.0$/, "")}%`;
}

/** Shorten a Stellar address for display: GABC…WXYZ. */
export function shortAddress(addr: string, lead = 4, tail = 4): string {
  if (!addr || addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

export function timeAgo(iso: string | number): string {
  const then = typeof iso === "number" ? iso : new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
