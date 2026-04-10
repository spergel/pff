"use client";

import { fmtDollar } from "@/src/lib/fmt";
"use client";

import type { DayAggregate } from "@/src/types/pff";



function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-gray-200">
        <div className={`h-1.5  ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-gray-500">{value}</span>
    </div>
  );
}

export function DailyActivityTable({ days }: { days: DayAggregate[] }) {
  const maxBuy = Math.max(...days.map((d) => d.total_buy_dollars), 1);
  const maxSell = Math.max(...days.map((d) => d.total_sell_dollars), 1);
  const maxChanges = Math.max(...days.map((d) => d.num_changes), 1);

  const reversed = [...days].reverse();

  return (
    <div className="overflow-x-auto border-2 border-gray-600">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
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
        <tbody className="divide-y divide-gray-300">
          {reversed.map((d) => {
            const net = d.total_buy_dollars - d.total_sell_dollars;
            return (
              <tr key={d.date} className="hover:bg-yellow-50">
                <td className="px-3 py-1.5 font-mono text-xs text-gray-600">{d.date}</td>
                <td className="px-3 py-1.5">
                  <Bar value={d.num_changes} max={maxChanges} color="bg-gray-400" />
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-emerald-600">{d.buys}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-rose-500">{d.sells}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-blue-700">{d.added}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-orange-600">{d.removed}</td>
                <td className="px-3 py-1.5">
                  <Bar value={d.total_buy_dollars} max={maxBuy} color="bg-emerald-500" />
                  <span className="font-mono text-xs text-emerald-600">
                    {fmtDollar(d.total_buy_dollars)}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <Bar value={d.total_sell_dollars} max={maxSell} color="bg-rose-500" />
                  <span className="font-mono text-xs text-rose-500">
                    {fmtDollar(d.total_sell_dollars)}
                  </span>
                </td>
                <td
                  className={`px-3 py-1.5 font-mono text-xs font-medium ${
                    net >= 0 ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {net >= 0 ? "+" : ""}
                  {fmtDollar(net)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
