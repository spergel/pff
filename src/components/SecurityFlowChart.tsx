"use client";

import { fmtDollar } from "@/src/lib/fmt";
import type { TickerActivityDay } from "@/src/types/pff";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EtfTicker } from "@/src/lib/data";

type ChartRow = {
  date: string;
  date_short: string;
  buy: number;
  sell: number;
  net: number;
};

const ETF_FLOW_COLORS: Record<string, { buy: string; sell: string }> = {
  // Match ETF chip color families from the UI.
  PFF: { buy: "#1d4ed8", sell: "#1e40af" },   // blue-700 / blue-800
  PGX: { buy: "#7e22ce", sell: "#6b21a8" },   // purple-700 / purple-800
  FPE: { buy: "#b45309", sell: "#92400e" },   // amber-700 / amber-800
  PFFA: { buy: "#15803d", sell: "#166534" },  // green-700 / green-800
  PFFD: { buy: "#0f766e", sell: "#115e59" },  // teal-700 / teal-800
  PFXF: { buy: "#be123c", sell: "#9f1239" },  // rose-700 / rose-800
};

function toChartRows(history: TickerActivityDay[]): ChartRow[] {
  return [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => {
      const flow = h.dollar_flow ?? 0;
      const isBuy = h.flow_type === "BUY" || h.flow_type === "ADDED";
      const isSell = h.flow_type === "SELL" || h.flow_type === "REMOVED";
      const buy = isBuy ? Math.max(flow, 0) : 0;
      const sell = isSell ? -Math.abs(flow) : 0;
      return {
        date: h.date,
        date_short: h.date.slice(5),
        buy,
        sell,
        net: buy + sell,
      };
    });
}

function SecurityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ChartRow = payload[0]?.payload;
  return (
    <div className="border-2 border-gray-600 bg-white p-2 font-mono text-xs">
      <p className="mb-1 font-semibold text-gray-900">{d.date}</p>
      <p className="text-emerald-600">buy {fmtDollar(d.buy)}</p>
      <p className="text-rose-500">sell {fmtDollar(Math.abs(d.sell))}</p>
      <p className={d.net >= 0 ? "text-emerald-700" : "text-rose-600"}>
        net {fmtDollar(d.net)}
      </p>
    </div>
  );
}

export function SecurityFlowChart({
  history,
  etf,
}: {
  history: TickerActivityDay[];
  etf: EtfTicker;
}) {
  const data = toChartRows(history);
  if (!data.length) return null;
  const palette = ETF_FLOW_COLORS[etf] ?? { buy: "#059669", sell: "#e11d48" };

  return (
    <div className="border-b border-gray-400 px-4 py-2">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-gray-500">
        <span>flow over time</span>
        <span>buys stacked against sells</span>
      </div>
      <ResponsiveContainer width="100%" height={165}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" vertical={false} />
          <XAxis
            dataKey="date_short"
            tick={{ fontSize: 10, fill: "#4b5563", fontFamily: "Courier New, monospace" }}
            axisLine={{ stroke: "#6b7280" }}
            tickLine={false}
            minTickGap={22}
          />
          <YAxis
            tickFormatter={(v) => fmtDollar(v)}
            tick={{ fontSize: 10, fill: "#4b5563", fontFamily: "Courier New, monospace" }}
            axisLine={{ stroke: "#6b7280" }}
            tickLine={false}
            width={68}
          />
          <Tooltip content={<SecurityTooltip />} cursor={{ fill: "#f3f4f6" }} />
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
          <Bar dataKey="buy" stackId="flow" fill={palette.buy} fillOpacity={0.8} isAnimationActive={false} />
          <Bar dataKey="sell" stackId="flow" fill={palette.sell} fillOpacity={0.82} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
