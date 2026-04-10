import { fmtDollar } from "@/src/lib/fmt";
"use client";

import type { ConsensusRow } from "@/src/types/pff";



const ETF_BADGE: Record<string, string> = {
  PFF: "bg-blue-100 text-blue-800",
  PGX: "bg-purple-100 text-purple-700",
  FPE: "bg-amber-100 text-amber-700",
  PFFA: "bg-green-100 text-green-700",
};

export function ConsensusTable({ rows }: { rows: ConsensusRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-gray-500 px-6 py-10 text-center font-mono text-xs text-gray-400">
        no cross-ETF consensus signals today
      </div>
    );
  }

  const buys = rows.filter((r) => r.consensus === "BUY");
  const sells = rows.filter((r) => r.consensus === "SELL");

  return (
    <div className="overflow-x-auto border-2 border-gray-600">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-4 py-2">Dir</th>
            <th className="px-4 py-2">Ticker</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Sector</th>
            <th className="px-4 py-2">ETFs</th>
            <th className="px-4 py-2">Combined $</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((row) => {
            const isBuy = row.consensus === "BUY";
            return (
              <tr
                key={row.cusip}
                className={` ${
                  isBuy
                    ? "bg-emerald-50 hover:bg-emerald-100"
                    : "bg-rose-50 hover:bg-rose-100"
                }`}
              >
                <td className="px-4 py-2.5">
                  <span
                    className={` px-2 py-0.5 font-mono text-xs font-bold ${
                      isBuy
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {row.etf_count === 3 ? "⚡ " : ""}
                    {row.consensus}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">
                  {row.ticker || "—"}
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-gray-600">{row.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{row.sector}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {row.etfs.map((etf) => (
                      <span
                        key={etf}
                        className={` px-1.5 py-0.5 text-xs font-semibold ${ETF_BADGE[etf] ?? "bg-gray-100 text-gray-500"}`}
                      >
                        {etf}
                      </span>
                    ))}
                  </div>
                </td>
                <td
                  className={`px-4 py-2.5 font-mono font-medium ${
                    isBuy ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {fmtDollar(row.combined_flow)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-gray-400 px-4 py-2 font-mono text-[10px] text-gray-400">
        {buys.length} consensus buy{buys.length !== 1 ? "s" : ""} · {sells.length} consensus sell
        {sells.length !== 1 ? "s" : ""} · ⚡ = all 3 ETFs agree
      </div>
    </div>
  );
}
