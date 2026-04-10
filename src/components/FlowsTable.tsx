"use client";

import { fmtDollar, fmtNum } from "@/src/lib/fmt";
"use client";

import { useState } from "react";
import type { FlowRow } from "@/src/types/pff";
import { SignalBadge } from "./SignalBadge";




function rowBg(type: FlowRow["flow_type"]) {
  if (type === "ADDED") return "bg-blue-50";
  if (type === "REMOVED") return "bg-orange-50";
  if (type === "BUY") return "bg-emerald-50";
  if (type === "SELL") return "bg-rose-50";
  if (type === "SUSPECT") return "bg-yellow-50";
  return "";
}

const ETF_BADGE: Record<string, string> = {
  PFF: "bg-blue-100 text-blue-800",
  PGX: "bg-purple-100 text-purple-700",
  FPE: "bg-amber-100 text-amber-700",
  PFFA: "bg-green-100 text-green-700",
};

type SortKey = "dollar_flow" | "shares_delta" | "weight_delta";

export function FlowsTable({
  flows,
  showAll = false,
  showEtf = false,
}: {
  flows: FlowRow[];
  showAll?: boolean;
  showEtf?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("dollar_flow");
  const [filterType, setFilterType] = useState<string>("all");
  const [showId, setShowId] = useState(false);

  const filtered = flows.filter((f) => {
    if (filterType === "all") return f.flow_type !== "UNCHANGED";
    return f.flow_type === filterType;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = Math.abs((a[sortKey] as number) ?? 0);
    const bv = Math.abs((b[sortKey] as number) ?? 0);
    return bv - av;
  });

  const visible = showAll ? sorted : sorted.slice(0, 50);

  const types = ["all", "BUY", "SELL", "ADDED", "REMOVED", "SUSPECT"];

  const BTN_ACTIVE = "border-gray-800 bg-gray-900 text-white";
  const BTN_INACTIVE = "border-gray-500 text-gray-500 hover:border-gray-400 hover:text-gray-900";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={` border px-2.5 py-1 font-mono  ${
              filterType === t ? BTN_ACTIVE : BTN_INACTIVE
            }`}
          >
            {t === "all" ? "all changes" : t}
          </button>
        ))}
        <button
          onClick={() => setShowId((v) => !v)}
          className={` border px-2.5 py-1 font-mono  ${
            showId ? BTN_ACTIVE : BTN_INACTIVE
          }`}
        >
          ISIN/CUSIP
        </button>
        <span className="ml-auto self-center font-mono text-gray-500">
          {filtered.length} rows
        </span>
      </div>

      <div className="overflow-x-auto border-2 border-gray-600">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
              {showEtf && <th className="px-3 py-2">ETF</th>}
              {showId && <th className="px-3 py-2">ISIN / CUSIP</th>}
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Sector</th>
              <th className="px-3 py-2">Type</th>
              <th
                className="cursor-pointer px-3 py-2 hover:text-gray-900"
                onClick={() => setSortKey("dollar_flow")}
              >
                $ Flow {sortKey === "dollar_flow" ? "↓" : ""}
              </th>
              <th
                className="cursor-pointer px-3 py-2 hover:text-gray-900"
                onClick={() => setSortKey("shares_delta")}
              >
                Δ Shares {sortKey === "shares_delta" ? "↓" : ""}
              </th>
              <th className="px-3 py-2">Prior Shares</th>
              <th className="px-3 py-2">Today Shares</th>
              <th
                className="cursor-pointer px-3 py-2 hover:text-gray-900"
                onClick={() => setSortKey("weight_delta")}
              >
                Δ Weight {sortKey === "weight_delta" ? "↓" : ""}
              </th>
              <th className="px-3 py-2">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {visible.map((row) => (
              <tr
                key={`${row.etf ?? ""}-${row.isin}`}
                className={`${rowBg(row.flow_type)} hover:opacity-80 `}
              >
                {showEtf && (
                  <td className="px-3 py-2">
                    <span
                      className={` px-1.5 py-0.5 font-mono text-xs font-semibold ${ETF_BADGE[row.etf ?? ""] ?? "bg-gray-100 text-gray-500"}`}
                    >
                      {row.etf ?? "—"}
                    </span>
                  </td>
                )}
                {showId && (
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-400">
                    {row.isin || row.cusip || "—"}
                  </td>
                )}
                <td className="px-3 py-2 font-mono font-semibold text-gray-900">
                  {row.ticker !== row.ticker_raw ? (
                    <span title={`Raw: ${row.ticker_raw}`}>{row.ticker}</span>
                  ) : (
                    row.ticker
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{row.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.sector}</td>
                <td className="px-3 py-2">
                  <SignalBadge type={row.flow_type} />
                </td>
                <td
                  className={`px-3 py-2 font-mono font-medium ${
                    (row.dollar_flow ?? 0) > 0 ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {row.dollar_flow != null ? fmtDollar(row.dollar_flow) : "—"}
                </td>
                <td
                  className={`px-3 py-2 font-mono ${
                    (row.shares_delta ?? 0) > 0 ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {row.shares_delta != null
                    ? `${row.shares_delta > 0 ? "+" : ""}${fmtNum(row.shares_delta)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500">
                  {row.prior_shares != null ? fmtNum(row.prior_shares) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500">
                  {row.today_shares != null ? fmtNum(row.today_shares) : "—"}
                </td>
                <td
                  className={`px-3 py-2 font-mono text-xs ${
                    (row.weight_delta ?? 0) > 0
                      ? "text-emerald-600"
                      : (row.weight_delta ?? 0) < 0
                      ? "text-rose-500"
                      : "text-gray-300"
                  }`}
                >
                  {row.weight_delta != null
                    ? `${row.weight_delta > 0 ? "+" : ""}${row.weight_delta.toFixed(3)}%`
                    : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500">
                  {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={(showEtf ? 11 : 10) + (showId ? 1 : 0)}
                  className="px-3 py-8 text-center font-mono text-xs text-gray-400"
                >
                  no data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
