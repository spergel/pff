"use client";

import { fmtDollar } from "@/src/lib/fmt";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartRow = {
  ticker: string;
  name: string;
  value: number; // positive = buy, negative = sell
  action: "BUY" | "SELL";
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ChartRow = payload[0]?.payload;
  return (
    <div className="border-2 border-gray-600 bg-white p-2 font-mono text-xs max-w-[220px]">
      <p className="font-semibold text-gray-900">{d.ticker}</p>
      <p className="truncate text-gray-500">{d.name}</p>
      <p className={d.action === "BUY" ? "text-emerald-600" : "text-rose-500"}>
        {d.action} {fmtDollar(Math.abs(d.value))}
      </p>
    </div>
  );
}

export function PredictionChart({ rows }: { rows: ChartRow[] }) {
  if (rows.length === 0) return null;

  const barHeight = Math.max(200, rows.length * 22);

  return (
    <ResponsiveContainer width="100%" height={barHeight}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 80, left: 4, bottom: 4 }}
      >
        <XAxis
          type="number"
          tickFormatter={(v) => fmtDollar(Math.abs(v))}
          tick={{ fontSize: 10, fill: "#6b7280", fontFamily: "Courier New, monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="ticker"
          tick={{ fontSize: 10, fill: "#374151", fontFamily: "Courier New, monospace" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine x={0} stroke="#6b7280" strokeWidth={1} />
        <Bar dataKey="value" isAnimationActive={false}>
          {rows.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.action === "BUY" ? "#059669" : "#e11d48"}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
