"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailySummary } from "@/src/types/pff";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d: DailySummary = payload[0]?.payload;
  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      <p className="text-green-700">Buys: {fmtDollar.format(d.total_buy_dollars)}</p>
      <p className="text-red-700">Sells: {fmtDollar.format(d.total_sell_dollars)}</p>
      <p className="text-slate-500">
        {d.added} added · {d.removed} removed · {d.suspect} suspect
      </p>
      <p className="text-slate-500">{d.num_changes} total changes</p>
    </div>
  );
}

export function FlowChart({ history }: { history: DailySummary[] }) {
  if (!history.length) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-400 text-sm">
        No flow history yet
      </div>
    );
  }

  // Flatten into bar chart data: positive = buys, negative = sells
  const data = history.map((d) => ({
    ...d,
    date_short: d.date.slice(5), // MM-DD
    net_flow: d.total_buy_dollars - d.total_sell_dollars,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="date_short"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => fmtDollar.format(v)}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#cbd5e1" />
        <Bar dataKey="net_flow" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.net_flow >= 0 ? "#22c55e" : "#ef4444"}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
