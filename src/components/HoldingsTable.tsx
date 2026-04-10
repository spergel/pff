"use client";

import { fmtDollar, fmtNum } from "@/src/lib/fmt";

import { useState } from "react";
import type { Holding } from "@/src/types/pff";




type SortKey = "weight" | "mkt_val" | "shares" | "price";

export function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("weight");
  const [query, setQuery] = useState("");

  const filtered = holdings.filter((h) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      h.ticker.toLowerCase().includes(q) ||
      h.ticker_raw.toLowerCase().includes(q) ||
      h.name.toLowerCase().includes(q) ||
      h.sector.toLowerCase().includes(q) ||
      h.isin.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort(
    (a, b) => ((b[sortKey] as number) ?? 0) - ((a[sortKey] as number) ?? 0)
  );

  const colHead = (label: string, key: SortKey) => (
    <th
      className="cursor-pointer px-3 py-2 hover:text-gray-900"
      onClick={() => setSortKey(key)}
    >
      {label} {sortKey === key ? "↓" : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-10 bg-white pb-2 flex items-center gap-3">
        <input
          type="text"
          placeholder="filter by ticker, name, sector, ISIN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border-2 border-gray-600 bg-white px-3 py-1.5 font-mono text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
        />
        <span className="font-mono text-xs text-gray-500">{sorted.length} holdings</span>
      </div>

      <div className="overflow-x-auto border-2 border-gray-600">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Sector</th>
              {colHead("Weight", "weight")}
              {colHead("Mkt Val", "mkt_val")}
              {colHead("Shares", "shares")}
              {colHead("Price", "price")}
              <th className="px-3 py-2">ISIN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {sorted.map((h, i) => (
              <tr key={h.isin} className="hover:bg-yellow-50">
                <td className="px-3 py-2 font-mono text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-mono font-semibold">
                  {h.ticker !== h.ticker_raw ? (
                    <span
                      className="text-blue-700"
                      title={`Resolved from raw ticker: ${h.ticker_raw}`}
                    >
                      {h.ticker}
                    </span>
                  ) : (
                    <span className="text-gray-900">{h.ticker}</span>
                  )}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-gray-600">{h.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{h.sector}</td>
                <td className="px-3 py-2 font-mono text-gray-800">
                  {h.weight != null ? `${h.weight.toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-gray-600">
                  {h.mkt_val != null ? fmtDollar(h.mkt_val) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-gray-600">
                  {h.shares != null ? fmtNum(h.shares) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-gray-600">
                  {h.price != null ? `$${h.price.toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-400">{h.isin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
