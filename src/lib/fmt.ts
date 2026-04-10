/**
 * Deterministic compact formatters — produce identical output on Node.js and browser,
 * avoiding ICU version mismatches that cause Next.js hydration errors.
 */

function compactNum(n: number, decimals = 1): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  let value: number;
  let suffix: string;

  if (abs >= 1_000_000_000) {
    value = abs / 1_000_000_000;
    suffix = "B";
  } else if (abs >= 1_000_000) {
    value = abs / 1_000_000;
    suffix = "M";
  } else if (abs >= 1_000) {
    value = abs / 1_000;
    suffix = "K";
  } else {
    return `${sign}${abs.toFixed(0)}`;
  }

  // Strip trailing .0 (e.g. 44.0 → 44)
  const rounded = value.toFixed(decimals);
  const display = rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
  return `${sign}${display}${suffix}`;
}

/** $1.2M, $44K, -$500K */
export function fmtDollar(n: number): string {
  return `$${compactNum(n)}`.replace("$-", "-$");
}

/** 1.2M, 44K (no currency symbol) */
export function fmtNum(n: number): string {
  return compactNum(n);
}
