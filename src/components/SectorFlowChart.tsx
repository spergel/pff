"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FlowRow } from "@/src/types/pff";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

function abbrev(s: string) {
  return s
    .replace("Financial Institutions", "Financials")
    .replace("Cash and/or Derivatives", "Cash");
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val: number = payload[0]?.value ?? 0;
  return (
    <div className="border-2 border-gray-600 bg-white p-2 font-mono text-xs">
      <p className="font-semibold text-gray-900">{label}</p>
      <p className={val >= 0 ? "text-emerald-600" : "text-rose-500"}>
        {fmtDollar.format(val)}
      </p>
    </div>
  );
}

export function SectorFlowChart({ flows }: { flows: FlowRow[] }) {
  const map: Record<string, number> = {};
  for (const f of flows) {
    if (f.flow_type === "UNCHANGED") continue;
    const sector = f.sector || "Other";
    const val = f.dollar_flow ?? 0;
    map[sector] = (map[sector] ?? 0) + val;
  }

  const data = Object.entries(map)
    .map(([sector, net]) => ({ sector: abbrev(sector), net }))
    .filter((d) => Math.abs(d.net) > 1000)
    .sort((a, b) => b.net - a.net);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center font-mono text-xs text-gray-400">
        no sector flow data
      </div>
    );
  }

  const barHeight = Math.max(180, data.length * 28);

  return (
    <ResponsiveContainer width="100%" height={barHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
      >
        <XAxis
          type="number"
          tickFormatter={(v) => fmtDollar.format(v)}
          tick={{ fontSize: 10, fill: "#6b7280", fontFamily: "ui-monospace, monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="sector"
          tick={{ fontSize: 10, fill: "#6b7280", fontFamily: "ui-monospace, monospace" }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="net" radius={[0, 3, 3, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.net >= 0 ? "#059669" : "#e11d48"}
              fillOpacity={0.75}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
