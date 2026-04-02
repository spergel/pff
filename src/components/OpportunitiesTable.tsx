"use client";

import type { FlowRow } from "@/src/types/pff";
import { SignalBadge } from "./SignalBadge";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtNum = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function OverhangBar({ days }: { days: number }) {
  // Visual bar: 0–30 days maps to 0–100% width
  const pct = Math.min(100, (days / 30) * 100);
  const color =
    days >= 10 ? "bg-red-500" : days >= 3 ? "bg-orange-400" : "bg-yellow-300";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs">{days.toFixed(1)}d</span>
    </div>
  );
}

function DiscountBadge({ pct }: { pct: number }) {
  if (pct >= 0)
    return <span className="font-mono text-xs text-slate-400">+{pct.toFixed(1)}%</span>;
  return (
    <span className="font-mono text-xs font-semibold text-green-700">
      {pct.toFixed(1)}% to par
    </span>
  );
}

export function OpportunitiesTable({ flows }: { flows: FlowRow[] }) {
  // Show SELL/REMOVED rows with signal_score > 0, sorted by signal_score desc
  // Fall back to showing all SELL/REMOVED if none have scores
  const candidates = flows
    .filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED")
    .filter((f) => f.adv_30d != null);

  const scored = candidates
    .filter((f) => f.signal_score != null && f.signal_score > 0)
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0));

  // If nothing scored (small rebalancing day), show by overhang_days instead
  const rows =
    scored.length > 0
      ? scored
      : candidates
          .filter((f) => f.overhang_days != null)
          .sort((a, b) => (b.overhang_days ?? 0) - (a.overhang_days ?? 0))
          .slice(0, 20);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
        No actionable forced-sell signals today.{" "}
        {candidates.length === 0
          ? "No SELL/REMOVED rows with ADV data."
          : `${candidates.length} SELL/REMOVED rows found but none with signal score > 0 (small rebalancing day).`}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Ticker</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">$ Sold</th>
            <th className="px-4 py-2">Shares Sold</th>
            <th className="px-4 py-2">ADV</th>
            <th className="px-4 py-2">Overhang</th>
            <th className="px-4 py-2">Price</th>
            <th className="px-4 py-2">Discount to Par</th>
            <th className="px-4 py-2">Signal Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.isin} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-mono font-semibold">{row.ticker}</td>
              <td className="max-w-xs truncate px-4 py-2.5 text-slate-600">{row.name}</td>
              <td className="px-4 py-2.5">
                <SignalBadge type={row.flow_type} />
              </td>
              <td className="px-4 py-2.5 font-mono text-red-700">
                {row.dollar_flow != null ? fmtDollar.format(Math.abs(row.dollar_flow)) : "—"}
              </td>
              <td className="px-4 py-2.5 font-mono text-slate-600">
                {row.shares_delta != null ? fmtNum.format(Math.abs(row.shares_delta)) : "—"}
              </td>
              <td className="px-4 py-2.5 font-mono text-slate-500">
                {row.adv_30d != null ? fmtNum.format(row.adv_30d) : "—"}
              </td>
              <td className="px-4 py-2.5">
                {row.overhang_days != null ? (
                  <OverhangBar days={row.overhang_days} />
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-slate-600">
                {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                {row.par_value != null && (
                  <span className="ml-1 text-xs text-slate-400">
                    / ${row.par_value.toFixed(0)}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {row.price_vs_par_pct != null ? (
                  <DiscountBadge pct={row.price_vs_par_pct} />
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-slate-700">
                {row.signal_score != null && row.signal_score > 0
                  ? row.signal_score.toFixed(1)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        Signal Score = overhang days × discount to par. Higher = larger forced dislocation.
        Buy the dip after confirming no credit event.
      </div>
    </div>
  );
}
