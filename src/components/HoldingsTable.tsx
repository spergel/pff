"use client";

import { useState } from "react";
import type { Holding } from "@/src/types/pff";

const fmtNum = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

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
      className="cursor-pointer px-3 py-2 hover:text-slate-800"
      onClick={() => setSortKey(key)}
    >
      {label} {sortKey === key ? "↓" : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by ticker, name, sector, ISIN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
        />
        <span className="text-sm text-slate-400">{sorted.length} holdings</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {sorted.map((h, i) => (
              <tr key={h.isin} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2 font-mono font-semibold">
                  {h.ticker !== h.ticker_raw ? (
                    <span
                      className="text-blue-700"
                      title={`Resolved from raw ticker: ${h.ticker_raw}`}
                    >
                      {h.ticker}
                    </span>
                  ) : (
                    h.ticker
                  )}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-slate-600">
                  {h.name}
                </td>
                <td className="px-3 py-2 text-slate-500">{h.sector}</td>
                <td className="px-3 py-2 font-mono">
                  {h.weight != null ? `${h.weight.toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-slate-600">
                  {h.mkt_val != null ? fmtDollar.format(h.mkt_val) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-slate-600">
                  {h.shares != null ? fmtNum.format(h.shares) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-slate-600">
                  {h.price != null ? `$${h.price.toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {h.isin}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
