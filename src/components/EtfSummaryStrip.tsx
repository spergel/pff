import type { EtfTicker } from "@/src/lib/data";
import { fmtDollar } from "@/src/lib/fmt";



const ETF_ACCENT: Record<string, string> = {
  PFF: "border-t-blue-700",
  PGX: "border-t-purple-500",
  FPE: "border-t-amber-500",
  PFFA: "border-t-green-500",
};

const ETF_LABEL: Record<string, string> = {
  PFF: "text-blue-700",
  PGX: "text-purple-600",
  FPE: "text-amber-600",
  PFFA: "text-green-600",
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
          className={` border-t-2 border-2 border-gray-600 bg-white px-4 py-3  ${ETF_ACCENT[s.etf] ?? ""}`}
        >
          <div className="flex items-baseline justify-between">
            <span className={`font-mono font-bold ${ETF_LABEL[s.etf] ?? "text-gray-900"}`}>
              {s.etf}
            </span>
            <span className="font-mono text-[10px] text-gray-500">{s.date ?? "no data"}</span>
          </div>
          {s.date ? (
            <div className="mt-2 flex gap-4 font-mono text-sm">
              <span className="text-emerald-600">
                ▲ {fmtDollar(s.buy_dollars)}
                <span className="ml-1 text-xs text-emerald-500">{s.buys}b</span>
              </span>
              <span className="text-rose-500">
                ▼ {fmtDollar(s.sell_dollars)}
                <span className="ml-1 text-xs text-rose-400">{s.sells}s</span>
              </span>
              <span className="ml-auto text-xs text-gray-400">{s.num_changes} chg</span>
            </div>
          ) : (
            <p className="mt-2 font-mono text-xs text-gray-400">pipeline not yet active</p>
          )}
        </div>
      ))}
    </div>
  );
}

export type { EtfStat };
