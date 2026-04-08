import type { EtfTicker } from "@/src/lib/data";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const ETF_ACCENT: Record<string, string> = {
  PFF: "border-l-blue-400",
  PGX: "border-l-purple-400",
  FPE: "border-l-amber-400",
};

interface EtfStat {
  etf: EtfTicker;
  date: string | null;
  buys: number;
  sells: number;
  buy_dollars: number;
  sell_dollars: number;
  num_changes: number;
}

export function EtfSummaryStrip({ stats }: { stats: EtfStat[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.map((s) => (
        <div
          key={s.etf}
          className={`rounded-lg border border-slate-200 border-l-4 bg-white px-4 py-3 ${ETF_ACCENT[s.etf] ?? ""}`}
        >
          <div className="flex items-baseline justify-between">
            <span className="font-bold text-slate-800">{s.etf}</span>
            <span className="text-xs text-slate-400">{s.date ?? "no data"}</span>
          </div>
          {s.date ? (
            <div className="mt-1.5 flex gap-4 text-sm">
              <span className="text-green-700">
                ▲ {fmtDollar.format(s.buy_dollars)}
                <span className="ml-1 text-xs text-green-500">{s.buys}b</span>
              </span>
              <span className="text-red-700">
                ▼ {fmtDollar.format(s.sell_dollars)}
                <span className="ml-1 text-xs text-red-400">{s.sells}s</span>
              </span>
              <span className="ml-auto text-xs text-slate-400">{s.num_changes} changes</span>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">Pipeline not yet active</p>
          )}
        </div>
      ))}
    </div>
  );
}

export type { EtfStat };
