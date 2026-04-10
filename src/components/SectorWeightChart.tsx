"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { Holding } from "@/src/types/pff";

const SECTOR_COLORS: Record<string, string> = {
  "Financial Institutions": "#0891b2",
  Utilities: "#059669",
  "Real Estate": "#d97706",
  Industrial: "#7c3aed",
  Consumer: "#db2777",
  Energy: "#dc2626",
  "Cash and/or Derivatives": "#6b7280",
  Other: "#9ca3af",
};

function abbrev(s: string) {
  return s
    .replace("Financial Institutions", "Financials")
    .replace("Cash and/or Derivatives", "Cash");
}

function getColor(sector: string, idx: number): string {
  if (SECTOR_COLORS[sector]) return SECTOR_COLORS[sector];
  const fallbacks = ["#0284c7", "#65a30d", "#ea580c", "#9333ea"];
  return fallbacks[idx % fallbacks.length];
}

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="border-2 border-gray-600 bg-white p-2 font-mono text-xs">
      <p className="font-semibold text-gray-900">{name}</p>
      <p className="text-gray-600">{fmtPct(value)} of portfolio</p>
    </div>
  );
}

export function SectorWeightChart({ holdings }: { holdings: Holding[] }) {
  const map: Record<string, number> = {};
  for (const h of holdings) {
    const sector = h.sector || "Other";
    map[sector] = (map[sector] ?? 0) + (h.weight ?? 0);
  }

  const data = Object.entries(map)
    .map(([sector, weight]) => ({ name: abbrev(sector), fullName: sector, weight }))
    .filter((d) => d.weight > 0.1)
    .sort((a, b) => b.weight - a.weight);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center font-mono text-xs text-gray-400">
        no holdings data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="weight"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.fullName}
              fill={getColor(entry.fullName, i)}
              fillOpacity={0.85}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "ui-monospace, monospace" }}>
              {value}
            </span>
          )}
          iconSize={8}
          wrapperStyle={{ paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
