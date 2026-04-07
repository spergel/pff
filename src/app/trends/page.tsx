import { loadDailySummary, loadTickerSummary } from "@/src/lib/data";
import { DailyActivityTable } from "@/src/components/trends/DailyActivityTable";
import { SectorRotation } from "@/src/components/trends/SectorRotation";
import { PressureLeaderboard } from "@/src/components/trends/PressureLeaderboard";
import type { TickerAggregate } from "@/src/types/pff";

export default function TrendsPage({
  searchParams,
}: {
  searchParams: { window?: string };
}) {
  const windowDays = parseInt(searchParams.window ?? "30", 10);

  const allDays = loadDailySummary();
  const recentDays = allDays.slice(-windowDays);

  const allTickers = loadTickerSummary();

  // Only tickers with activity in the selected window
  const windowStart = recentDays[0]?.date ?? "";
  const activeTickers: TickerAggregate[] = Object.values(allTickers).filter(
    (t) => t.history.some((h) => h.date >= windowStart)
  );

  // Compute window-scoped stats per ticker
  const tickersWithWindowStats = activeTickers.map((t) => {
    const windowHistory = t.history.filter((h) => h.date >= windowStart);
    const windowBuyDays = windowHistory.filter(
      (h) => h.flow_type === "BUY" || h.flow_type === "ADDED"
    ).length;
    const windowSellDays = windowHistory.filter(
      (h) => h.flow_type === "SELL" || h.flow_type === "REMOVED"
    ).length;
    const windowNetDollars = windowHistory.reduce(
      (s, h) => s + (h.dollar_flow ?? 0),
      0
    );
    return { ...t, windowBuyDays, windowSellDays, windowNetDollars };
  });

  const underPressure = [...tickersWithWindowStats]
    .filter((t) => t.windowSellDays > 0)
    .sort((a, b) => {
      // Primary: current sell streak; secondary: sell days in window
      const aStreak = a.current_streak < 0 ? Math.abs(a.current_streak) : 0;
      const bStreak = b.current_streak < 0 ? Math.abs(b.current_streak) : 0;
      if (bStreak !== aStreak) return bStreak - aStreak;
      return b.windowSellDays - a.windowSellDays;
    })
    .slice(0, 30);

  const beingAccumulated = [...tickersWithWindowStats]
    .filter((t) => t.windowBuyDays > 0)
    .sort((a, b) => {
      const aStreak = a.current_streak > 0 ? a.current_streak : 0;
      const bStreak = b.current_streak > 0 ? b.current_streak : 0;
      if (bStreak !== aStreak) return bStreak - aStreak;
      return b.windowBuyDays - a.windowBuyDays;
    })
    .slice(0, 30);

  const windows = [
    { value: 10, label: "10d" },
    { value: 30, label: "30d" },
    { value: 60, label: "60d" },
    { value: 90, label: "90d" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold">Trends</h1>
        <div className="flex gap-1">
          {windows.map((w) => (
            <a
              key={w.value}
              href={`/trends?window=${w.value}`}
              className={`rounded border px-3 py-1 text-sm transition-colors ${
                windowDays === w.value
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              {w.label}
            </a>
          ))}
        </div>
        <span className="text-sm text-slate-400">
          {recentDays.length} trading days · {activeTickers.length} active positions
        </span>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Daily Activity
        </h2>
        <DailyActivityTable days={recentDays} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sector Rotation ({windowDays}d net $ flow)
        </h2>
        <SectorRotation days={recentDays} />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-600">
            Under Pressure — most sell days
          </h2>
          <PressureLeaderboard tickers={underPressure} mode="sell" windowDays={windowDays} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-green-700">
            Being Accumulated — most buy days
          </h2>
          <PressureLeaderboard tickers={beingAccumulated} mode="buy" windowDays={windowDays} />
        </section>
      </div>
    </div>
  );
}
