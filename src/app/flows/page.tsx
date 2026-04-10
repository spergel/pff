import {
  listFlowDates,
  listHoldingDates,
  loadFlows,
  loadHoldings,
  loadDailySummary,
  loadTickerSummary,
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import { FlowsTable } from "@/src/components/FlowsTable";
import { HoldingsTable } from "@/src/components/HoldingsTable";
import { DateNav } from "@/src/components/DateNav";
import { SectorFlowChart } from "@/src/components/SectorFlowChart";
import { SectorWeightChart } from "@/src/components/SectorWeightChart";
import { DailyActivityTable } from "@/src/components/trends/DailyActivityTable";
import { SectorRotation } from "@/src/components/trends/SectorRotation";
import { PressureLeaderboard } from "@/src/components/trends/PressureLeaderboard";
import type { EtfTicker } from "@/src/lib/data";
import type { TickerAggregate } from "@/src/types/pff";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

type Tab = "flows" | "holdings" | "trends";

export default function FlowsPage({
  searchParams,
}: {
  searchParams: { date?: string; etf?: string; tab?: string; window?: string };
}) {
  const etf = (SUPPORTED_ETFS.includes(searchParams.etf as EtfTicker)
    ? searchParams.etf
    : "PFF") as EtfTicker;

  const tab: Tab =
    searchParams.tab === "holdings"
      ? "holdings"
      : searchParams.tab === "trends"
      ? "trends"
      : "flows";

  const windowDays = parseInt(searchParams.window ?? "30", 10);

  const flowDates = listFlowDates(etf);
  const selectedDate = searchParams.date ?? flowDates[0];
  const flows = selectedDate ? loadFlows(selectedDate, etf) : [];

  const dateIdx = selectedDate ? flowDates.indexOf(selectedDate) : -1;
  const prevDate =
    dateIdx >= 0 && dateIdx < flowDates.length - 1 ? flowDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? flowDates[dateIdx - 1] : null;

  const holdingDates = listHoldingDates(etf);
  const holdingDate =
    selectedDate && holdingDates.includes(selectedDate)
      ? selectedDate
      : holdingDates[0];
  const holdings = holdingDate ? loadHoldings(holdingDate, etf) : [];

  const changes = flows.filter((f) => f.flow_type !== "UNCHANGED");
  const buyDollars = changes
    .filter((f) => f.flow_type === "BUY" || f.flow_type === "ADDED")
    .reduce((s, f) => s + (f.dollar_flow ?? 0), 0);
  const sellDollars = changes
    .filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED")
    .reduce((s, f) => s + Math.abs(f.dollar_flow ?? 0), 0);

  const aum = holdings.reduce((s, h) => s + (h.mkt_val ?? 0), 0);

  // Trends data
  const allDays = loadDailySummary(etf);
  const recentDays = allDays.slice(-windowDays);
  const allTickers = loadTickerSummary(etf);
  const windowStart = recentDays[0]?.date ?? "";

  const activeTickers: TickerAggregate[] = Object.values(allTickers).filter(
    (t) => t.history.some((h) => h.date >= windowStart)
  );

  const tickersWithWindowStats = activeTickers.map((t) => {
    const windowHistory = t.history.filter((h) => h.date >= windowStart);
    const windowBuyDays = windowHistory.filter(
      (h) => h.flow_type === "BUY" || h.flow_type === "ADDED"
    ).length;
    const windowSellDays = windowHistory.filter(
      (h) => h.flow_type === "SELL" || h.flow_type === "REMOVED"
    ).length;
    const windowNetDollars = windowHistory.reduce((s, h) => s + (h.dollar_flow ?? 0), 0);
    return { ...t, windowBuyDays, windowSellDays, windowNetDollars };
  });

  const underPressure = [...tickersWithWindowStats]
    .filter((t) => t.windowSellDays > 0)
    .sort((a, b) => {
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

  const tabHref = (t: string, extra = "") =>
    `/flows?etf=${etf}${selectedDate ? `&date=${selectedDate}` : ""}&tab=${t}${extra}`;

  const BTN_ACTIVE = "border-gray-800 bg-gray-900 text-white";
  const BTN_INACTIVE = "border-gray-500 text-gray-500 hover:border-gray-400 hover:text-gray-900";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-gray-900">Holdings &amp; Flows</h1>

        {/* ETF selector */}
        <div className="flex gap-1">
          {SUPPORTED_ETFS.map((e) => (
            <a
              key={e}
              href={`/flows?etf=${e}&tab=${tab}`}
              className={` border px-2.5 py-1 font-mono text-xs  ${
                etf === e ? BTN_ACTIVE : BTN_INACTIVE
              }`}
            >
              {e}
            </a>
          ))}
        </div>

        {tab !== "trends" && selectedDate && (
          <DateNav
            selectedDate={selectedDate}
            prevDate={prevDate}
            nextDate={nextDate}
            etf={etf}
            allDates={flowDates}
            basePath="/flows"
            extraParams={`tab=${tab}`}
          />
        )}

        {tab === "flows" && changes.length > 0 && (
          <span className="font-mono text-xs text-gray-500">
            <span className="text-emerald-600">{fmt.format(buyDollars)} bought</span>
            {" · "}
            <span className="text-rose-500">{fmt.format(sellDollars)} sold</span>
            {" · "}
            <span>{changes.length} changes</span>
          </span>
        )}
        {tab === "holdings" && holdings.length > 0 && (
          <span className="font-mono text-xs text-gray-500">
            {holdings.length} securities · {fmt.format(aum)} AUM
            {holdingDate !== selectedDate && holdingDate && (
              <span className="ml-1 text-gray-400">(holdings as of {holdingDate})</span>
            )}
          </span>
        )}
        {tab === "trends" && (
          <span className="font-mono text-xs text-gray-500">
            {recentDays.length} trading days · {activeTickers.length} active positions
          </span>
        )}
      </div>

      {/* Charts row — only for flows/holdings tabs */}
      {tab !== "trends" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="border-2 border-gray-600 bg-white p-4">
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Sector Flow (net $)
            </p>
            <SectorFlowChart flows={flows} />
          </div>
          <div className="border-2 border-gray-600 bg-white p-4">
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Sector Weights
            </p>
            <SectorWeightChart holdings={holdings} />
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-0.5 border-b-2 border-gray-600">
        {(["flows", "holdings", "trends"] as const).map((t) => (
          <a
            key={t}
            href={tabHref(t)}
            className={`px-4 py-2 font-mono text-xs font-medium capitalize  ${
              tab === t
                ? "border-b-2 border-blue-800 bg-white text-gray-900 font-bold"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {t}
          </a>
        ))}

        {/* Window picker — only show when on trends tab */}
        {tab === "trends" && (
          <div className="ml-auto flex items-center gap-1 pb-1">
            {windows.map((w) => (
              <a
                key={w.value}
                href={tabHref("trends", `&window=${w.value}`)}
                className={` border px-2.5 py-1 font-mono text-xs  ${
                  windowDays === w.value ? BTN_ACTIVE : BTN_INACTIVE
                }`}
              >
                {w.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Tab content */}
      {tab === "flows" ? (
        flows.length === 0 ? (
          <div className="border border-gray-500 px-6 py-12 text-center font-mono text-xs text-gray-400">
            no flow data for this date
          </div>
        ) : (
          <div className="border-2 border-gray-600 bg-white p-4">
            <FlowsTable flows={flows} showAll />
          </div>
        )
      ) : tab === "holdings" ? (
        holdings.length === 0 ? (
          <div className="border border-gray-500 px-6 py-12 text-center font-mono text-xs text-gray-400">
            no holdings data available
          </div>
        ) : (
          <div className="border-2 border-gray-600 bg-white p-4">
            <HoldingsTable holdings={holdings} />
          </div>
        )
      ) : (
        /* Trends tab */
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Daily Activity
            </h2>
            <DailyActivityTable days={recentDays} />
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Sector Rotation ({windowDays}d net $ flow)
            </h2>
            <SectorRotation days={recentDays} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-500">
                Under Pressure — most sell days
              </h2>
              <PressureLeaderboard tickers={underPressure} mode="sell" windowDays={windowDays} />
            </section>

            <section>
              <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                Being Accumulated — most buy days
              </h2>
              <PressureLeaderboard tickers={beingAccumulated} mode="buy" windowDays={windowDays} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
