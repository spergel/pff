"use client";

import type { DayAggregate } from "@/src/types/pff";

const fmtM = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs text-slate-600">{value}</span>
    </div>
  );
}

export function DailyActivityTable({ days }: { days: DayAggregate[] }) {
  const maxBuy = Math.max(...days.map((d) => d.total_buy_dollars), 1);
  const maxSell = Math.max(...days.map((d) => d.total_sell_dollars), 1);
  const maxChanges = Math.max(...days.map((d) => d.num_changes), 1);

  const reversed = [...days].reverse();

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Changes</th>
            <th className="px-3 py-2">Buys</th>
            <th className="px-3 py-2">Sells</th>
            <th className="px-3 py-2">+Added</th>
            <th className="px-3 py-2">−Removed</th>
            <th className="px-3 py-2">$ Bought</th>
            <th className="px-3 py-2">$ Sold</th>
            <th className="px-3 py-2">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reversed.map((d) => {
            const net = d.total_buy_dollars - d.total_sell_dollars;
            return (
              <tr key={d.date} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{d.date}</td>
                <td className="px-3 py-1.5">
                  <Bar value={d.num_changes} max={maxChanges} color="bg-slate-400" />
                </td>
                <td className="px-3 py-1.5 font-mono text-green-700">{d.buys}</td>
                <td className="px-3 py-1.5 font-mono text-red-700">{d.sells}</td>
                <td className="px-3 py-1.5 font-mono text-blue-700">{d.added}</td>
                <td className="px-3 py-1.5 font-mono text-orange-700">{d.removed}</td>
                <td className="px-3 py-1.5">
                  <Bar value={d.total_buy_dollars} max={maxBuy} color="bg-green-400" />
                  <span className="font-mono text-xs text-green-700">
                    {fmtM.format(d.total_buy_dollars)}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <Bar value={d.total_sell_dollars} max={maxSell} color="bg-red-400" />
                  <span className="font-mono text-xs text-red-700">
                    {fmtM.format(d.total_sell_dollars)}
                  </span>
                </td>
                <td
                  className={`px-3 py-1.5 font-mono text-xs font-medium ${
                    net >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {net >= 0 ? "+" : ""}
                  {fmtM.format(net)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
