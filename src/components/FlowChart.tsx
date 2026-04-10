"use client";

import { fmtDollar } from "@/src/lib/fmt";
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
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DailySummary } from "@/src/types/pff";



// Each ETF gets a fixed color; positive = full, negative = same color (bars go below zero)
const ETF_CONFIG: Record<string, { color: string; label: string }> = {
  pff_net:  { color: "#1d4ed8", label: "PFF" },  // blue
  pgx_net:  { color: "#7c3aed", label: "PGX" },  // purple
  fpe_net:  { color: "#d97706", label: "FPE" },  // amber
  pffa_net: { color: "#16a34a", label: "PFFA" }, // green
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="border-2 border-gray-600 bg-white p-3 text-xs">
      <p className="mb-1 font-mono font-semibold text-gray-900">{d.date}</p>
      {payload.map((p: any) => {
        const cfg = ETF_CONFIG[p.dataKey];
        return (
          <p key={p.dataKey} className="font-mono" style={{ color: cfg?.color ?? p.color }}>
            {cfg?.label ?? p.dataKey}: {fmtDollar(p.value)}
          </p>
        );
      })}
      <p className="mt-1 font-mono text-[10px] text-gray-400">click to view flows</p>
    </div>
  );
}

function buildChartData(
  primary: DailySummary[],
  aux: Record<string, DailySummary[]>
) {
  const byDate: Record<string, any> = {};
  for (const d of primary) {
    byDate[d.date] = {
      ...d,
      date_short: d.date.slice(5),
      pff_net: d.total_buy_dollars - d.total_sell_dollars,
    };
  }
  for (const [etf, hist] of Object.entries(aux)) {
    for (const d of hist) {
      if (byDate[d.date]) {
        byDate[d.date][`${etf.toLowerCase()}_net`] =
          d.total_buy_dollars - d.total_sell_dollars;
      }
    }
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

export function FlowChart({
  history,
  auxHistories = {},
  selectedDate,
  etf = "PFF",
}: {
  history: DailySummary[];
  auxHistories?: Record<string, DailySummary[]>;
  selectedDate?: string;
  etf?: string;
}) {
  const router = useRouter();

  const allKeys = [
    "pff_net",
    ...Object.keys(auxHistories)
      .filter((k) => auxHistories[k].length > 0)
      .map((e) => `${e.toLowerCase()}_net`),
  ];

  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!history.length) {
    return (
      <div className="flex h-48 items-center justify-center font-mono text-xs text-gray-400">
        no flow history yet
      </div>
    );
  }

  const data = buildChartData(history, auxHistories);
  const visibleKeys = allKeys.filter((k) => !hidden.has(k));

  function handleBarClick(payload: any) {
    const date: string | undefined = payload?.activePayload?.[0]?.payload?.date;
    if (date) router.push(`/?date=${date}&etf=${etf}`);
  }

  return (
    <div>
      {/* ETF toggle pills */}
      {allKeys.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {allKeys.map((key) => {
            const cfg = ETF_CONFIG[key];
            const isHidden = hidden.has(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className="border px-2 py-0.5 font-mono text-[10px] font-semibold"
                style={{
                  borderColor: isHidden ? "#9ca3af" : cfg?.color,
                  color: isHidden ? "#9ca3af" : cfg?.color,
                  background: isHidden ? "transparent" : cfg?.color + "18",
                }}
              >
                {cfg?.label ?? key}
              </button>
            );
          })}
        </div>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onClick={handleBarClick}
          style={{ cursor: "pointer" }}
          barCategoryGap="12%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" vertical={false} />
          <XAxis
            dataKey="date_short"
            tick={{ fontSize: 10, fill: "#4b5563", fontFamily: "Courier New, monospace" }}
            axisLine={{ stroke: "#6b7280" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => fmtDollar(v)}
            tick={{ fontSize: 10, fill: "#4b5563", fontFamily: "Courier New, monospace" }}
            axisLine={{ stroke: "#6b7280" }}
            tickLine={false}
            width={68}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f3f4f6" }} />
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
          {visibleKeys.map((key) => {
            const cfg = ETF_CONFIG[key] ?? { color: "#059669", label: key };
            return (
              <Bar
                key={key}
                dataKey={key}
                name={cfg.label}
                stackId="flow"
                fill={cfg.color}
              >
                {data.map((entry, i) => {
                  const isSelected = entry.date === selectedDate;
                  return (
                    <Cell
                      key={i}
                      fill={cfg.color}
                      fillOpacity={isSelected ? 1 : 0.7}
                      stroke={isSelected ? cfg.color : "none"}
                      strokeWidth={isSelected ? 2 : 0}
                    />
                  );
                })}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
