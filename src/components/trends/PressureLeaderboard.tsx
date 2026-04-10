import type { TickerAggregate } from "@/src/types/pff";

const fmtM = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

type EnrichedTicker = TickerAggregate & {
  windowBuyDays: number;
  windowSellDays: number;
  windowNetDollars: number;
};

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  const isSell = streak < 0;
  const days = Math.abs(streak);
  return (
    <span
      className={`ml-1  px-1.5 py-0.5 font-mono text-[10px] font-bold ${
        isSell
          ? "bg-rose-100 text-rose-600"
          : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {isSell ? "↓" : "↑"}
      {days}d
    </span>
  );
}

function ActivityDots({
  history,
  mode,
  windowStart,
}: {
  history: TickerAggregate["history"];
  mode: "sell" | "buy";
  windowStart: string;
}) {
  const windowHistory = history.filter((h) => h.date >= windowStart).slice(-20);
  return (
    <div className="flex gap-0.5">
      {windowHistory.map((h) => {
        const isBuy = h.flow_type === "BUY" || h.flow_type === "ADDED";
        const isSell = h.flow_type === "SELL" || h.flow_type === "REMOVED";
        const isSuspect = h.flow_type === "SUSPECT";
        return (
          <div
            key={h.date}
            title={`${h.date}: ${h.flow_type} ${fmtM.format(h.dollar_flow)}`}
            className={`h-3 w-2  ${
              isBuy
                ? "bg-emerald-500"
                : isSell
                ? "bg-rose-500"
                : isSuspect
                ? "bg-yellow-400"
                : "bg-gray-200"
            }`}
          />
        );
      })}
    </div>
  );
}

export function PressureLeaderboard({
  tickers,
  mode,
  windowDays,
}: {
  tickers: EnrichedTicker[];
  mode: "sell" | "buy";
  windowDays: number;
}) {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  if (!tickers.length) {
    return (
      <div className="border border-gray-500 px-4 py-8 text-center font-mono text-xs text-gray-400">
        no data
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-2 border-gray-600">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Streak</th>
            <th className="px-3 py-2">{mode === "sell" ? "Sell" : "Buy"} Days</th>
            <th className="px-3 py-2">Net Flow</th>
            <th className="px-3 py-2">Activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {tickers.map((t) => (
            <tr key={t.isin} className="hover:bg-yellow-50">
              <td className="px-3 py-2">
                <div className="font-mono font-semibold text-gray-900">
                  {t.ticker}
                  <StreakBadge streak={t.current_streak} />
                </div>
                <div className="truncate max-w-[160px] font-mono text-[10px] text-gray-500">
                  {t.name}
                </div>
                <div className="font-mono text-[10px] text-gray-400">{t.sector}</div>
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {t.current_streak !== 0 ? (
                  <span className={t.current_streak < 0 ? "text-rose-500" : "text-emerald-600"}>
                    {t.current_streak < 0 ? "SELL" : "BUY"} ×{Math.abs(t.current_streak)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {mode === "sell" ? (
                  <span className="text-rose-500">{t.windowSellDays}d</span>
                ) : (
                  <span className="text-emerald-600">{t.windowBuyDays}d</span>
                )}
                <span className="text-gray-400"> / {windowDays}d</span>
              </td>
              <td
                className={`px-3 py-2 font-mono text-xs font-medium ${
                  t.windowNetDollars >= 0 ? "text-emerald-600" : "text-rose-500"
                }`}
              >
                {t.windowNetDollars >= 0 ? "+" : ""}
                {fmtM.format(t.windowNetDollars)}
              </td>
              <td className="px-3 py-2">
                <ActivityDots history={t.history} mode={mode} windowStart={windowStart} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
