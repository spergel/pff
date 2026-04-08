"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import type { DailySummary } from "@/src/types/pff";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: DailySummary = payload[0]?.payload;
  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-xs shadow-md">
      <p className="mb-1 font-semibold">{d.date}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtDollar.format(p.value)}
        </p>
      ))}
      <p className="mt-1 text-slate-400 italic">Click to view flows</p>
    </div>
  );
}

// Merge aux histories onto the PFF date spine
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

const ETF_COLORS = {
  pff_net: { pos: "#22c55e", neg: "#ef4444" },
  pgx_net: { pos: "#a855f7", neg: "#c084fc" },
  fpe_net: { pos: "#f59e0b", neg: "#fcd34d" },
};

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

  if (!history.length) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-400 text-sm">
        No flow history yet
      </div>
    );
  }

  const data = buildChartData(history, auxHistories);
  const hasAux = Object.keys(auxHistories).some(
    (k) => auxHistories[k].length > 0
  );

  function handleBarClick(payload: any) {
    const date: string | undefined = payload?.activePayload?.[0]?.payload?.date;
    if (date) router.push(`/?date=${date}&etf=${etf}`);
  }

  const netKeys = ["pff_net", ...Object.keys(auxHistories).map((e) => `${e.toLowerCase()}_net`)];
  const etfLabels: Record<string, string> = { pff_net: "PFF", pgx_net: "PGX", fpe_net: "FPE" };

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        onClick={handleBarClick}
        style={{ cursor: "pointer" }}
        barGap={2}
        barCategoryGap="20%"
      >
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
        {hasAux && (
          <Legend
            formatter={(value) => etfLabels[value] ?? value}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
        )}
        {netKeys.map((key) => {
          const colors = ETF_COLORS[key as keyof typeof ETF_COLORS] ?? { pos: "#22c55e", neg: "#ef4444" };
          return (
            <Bar key={key} dataKey={key} name={key} radius={[2, 2, 0, 0]}>
              {data.map((entry, i) => {
                const val = entry[key] ?? 0;
                const isSelected = entry.date === selectedDate;
                return (
                  <Cell
                    key={i}
                    fill={val >= 0 ? colors.pos : colors.neg}
                    fillOpacity={isSelected ? 1 : 0.65}
                    stroke={isSelected ? (val >= 0 ? colors.pos : colors.neg) : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                );
              })}
            </Bar>
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
