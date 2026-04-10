"use client";

import { fmtDollar, fmtNum } from "@/src/lib/fmt";

import type { FlowRow } from "@/src/types/pff";
import { SignalBadge } from "./SignalBadge";




function OverhangBar({ days }: { days: number }) {
  const pct = Math.min(100, (days / 30) * 100);
  const color =
    days >= 10 ? "bg-rose-500" : days >= 3 ? "bg-orange-400" : "bg-yellow-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-gray-200">
        <div className={`h-1.5  ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-gray-500">{days.toFixed(1)}d</span>
    </div>
  );
}

function DiscountBadge({ pct }: { pct: number }) {
  if (pct >= 0)
    return <span className="font-mono text-xs text-gray-500">+{pct.toFixed(1)}%</span>;
  return (
    <span className="font-mono text-xs font-semibold text-emerald-600">
      {pct.toFixed(1)}%
    </span>
  );
}

export function OpportunitiesTable({ flows }: { flows: FlowRow[] }) {
  const candidates = flows
    .filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED")
    .filter((f) => f.adv_30d != null);

  const scored = candidates
    .filter((f) => f.signal_score != null && f.signal_score > 0)
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0));

  const rows =
    scored.length > 0
      ? scored
      : candidates
          .filter((f) => f.overhang_days != null)
          .sort((a, b) => (b.overhang_days ?? 0) - (a.overhang_days ?? 0))
          .slice(0, 20);

  if (rows.length === 0) {
    return (
      <div className="border border-gray-500 px-6 py-8 text-center font-mono text-xs text-gray-400">
        no actionable forced-sell signals today
        {candidates.length === 0
          ? " — no SELL/REMOVED rows with ADV data"
          : ` — ${candidates.length} sell rows but none with signal score > 0`}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-2 border-gray-600">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">$ Sold</th>
            <th className="px-3 py-2">Shares</th>
            <th className="px-3 py-2">ADV</th>
            <th className="px-3 py-2">Overhang</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">vs Par</th>
            <th className="px-3 py-2">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((row) => (
            <tr key={row.isin} className="hover:bg-yellow-50">
              <td className="px-3 py-2 font-mono font-semibold text-gray-900">
                {row.ticker}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2 text-gray-600">{row.name}</td>
              <td className="px-3 py-2">
                <SignalBadge type={row.flow_type} />
              </td>
              <td className="px-3 py-2 font-mono text-rose-500">
                {row.dollar_flow != null ? fmtDollar(Math.abs(row.dollar_flow)) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-gray-600">
                {row.shares_delta != null ? fmtNum(Math.abs(row.shares_delta)) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-gray-500">
                {row.adv_30d != null ? fmtNum(row.adv_30d) : "—"}
              </td>
              <td className="px-3 py-2">
                {row.overhang_days != null ? (
                  <OverhangBar days={row.overhang_days} />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-gray-600">
                {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                {row.par_value != null && (
                  <span className="ml-1 text-xs text-gray-400">
                    /${row.par_value.toFixed(0)}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {row.price_vs_par_pct != null ? (
                  <DiscountBadge pct={row.price_vs_par_pct} />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-3 py-2 font-mono font-bold text-gray-800">
                {row.signal_score != null && row.signal_score > 0
                  ? row.signal_score.toFixed(1)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-gray-400 px-3 py-2 font-mono text-[10px] text-gray-400">
        score = overhang days × discount to par · higher = larger forced dislocation · confirm no credit event before buying
      </div>
    </div>
  );
}
