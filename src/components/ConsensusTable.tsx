"use client";

import type { ConsensusRow } from "@/src/types/pff";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const ETF_COLORS: Record<string, string> = {
  PFF: "bg-blue-100 text-blue-700",
  PGX: "bg-purple-100 text-purple-700",
  FPE: "bg-amber-100 text-amber-700",
};

export function ConsensusTable({ rows }: { rows: ConsensusRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
        No cross-ETF consensus signals today — no security being bought or sold by 2+ funds simultaneously.
      </div>
    );
  }

  const buys = rows.filter((r) => r.consensus === "BUY");
  const sells = rows.filter((r) => r.consensus === "SELL");

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Direction</th>
            <th className="px-4 py-2">Ticker</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Sector</th>
            <th className="px-4 py-2">ETFs</th>
            <th className="px-4 py-2">Combined $</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const isBuy = row.consensus === "BUY";
            return (
              <tr key={row.cusip} className={isBuy ? "bg-green-50" : "bg-red-50"}>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${isBuy ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                    {row.etf_count === 3 ? "⚡ " : ""}{row.consensus}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono font-semibold">{row.ticker || "—"}</td>
                <td className="max-w-xs truncate px-4 py-2.5 text-slate-600">{row.name}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{row.sector}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {row.etfs.map((etf) => (
                      <span key={etf} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${ETF_COLORS[etf] ?? "bg-slate-100 text-slate-600"}`}>
                        {etf}
                      </span>
                    ))}
                  </div>
                </td>
                <td className={`px-4 py-2.5 font-mono font-medium ${isBuy ? "text-green-700" : "text-red-700"}`}>
                  {fmtDollar.format(row.combined_flow)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        {buys.length} consensus buy{buys.length !== 1 ? "s" : ""} · {sells.length} consensus sell{sells.length !== 1 ? "s" : ""} · ⚡ = all 3 ETFs agree
      </div>
    </div>
  );
}
