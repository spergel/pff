import { fmtDollar } from "@/src/lib/fmt";
import {
  listFlowDates,
  loadFlows,
  loadDailySummary,
  loadTickerSummary,
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import { FlowsTable } from "@/src/components/FlowsTable";
import { DateNav } from "@/src/components/DateNav";
import { SectorFlowChart } from "@/src/components/SectorFlowChart";
import { DailyActivityTable } from "@/src/components/trends/DailyActivityTable";
import { SectorRotation } from "@/src/components/trends/SectorRotation";
import { PressureLeaderboard } from "@/src/components/trends/PressureLeaderboard";
import type { EtfTicker } from "@/src/lib/data";
import type { DayAggregate, TickerAggregate } from "@/src/types/pff";

type Tab = "flows" | "trends";
type TrendsEtf = EtfTicker | "ALL";

// ─── helpers ───────────────────────────────────────────────────────────────

function aggregateDays(etfList: EtfTicker[]): DayAggregate[] {
  const byDate: Record<string, DayAggregate> = {};
  for (const etf of etfList) {
    for (const day of loadDailySummary(etf)) {
      if (!byDate[day.date]) {
        byDate[day.date] = { ...day, sector_net: { ...day.sector_net } };
      } else {
        const d = byDate[day.date];
        d.buys += day.buys;
        d.sells += day.sells;
        d.added += day.added;
        d.removed += day.removed;
        d.suspect += day.suspect;
        d.total_buy_dollars += day.total_buy_dollars;
        d.total_sell_dollars += day.total_sell_dollars;
        d.num_changes += day.num_changes;
        for (const [s, n] of Object.entries(day.sector_net ?? {})) {
          d.sector_net[s] = (d.sector_net[s] ?? 0) + n;
        }
      }
    }
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateTickers(etfList: EtfTicker[]): TickerAggregate[] {
  // Aggregate by ISIN across ETFs — same security in multiple ETFs gets combined
  const byIsin: Record<string, TickerAggregate> = {};
  for (const etf of etfList) {
    for (const t of Object.values(loadTickerSummary(etf))) {
      if (!byIsin[t.isin]) {
        byIsin[t.isin] = { ...t, history: [...t.history] };
      } else {
        const existing = byIsin[t.isin];
        existing.buy_days += t.buy_days;
        existing.sell_days += t.sell_days;
        existing.added_days += t.added_days;
        existing.removed_days += t.removed_days;
        existing.suspect_days += t.suspect_days;
        existing.total_buy_dollars += t.total_buy_dollars;
        existing.total_sell_dollars += t.total_sell_dollars;
        existing.net_dollar_flow += t.net_dollar_flow;
        existing.net_shares_delta += t.net_shares_delta;
        // Merge history by date, summing dollar flows
        const histByDate: Record<string, (typeof t.history)[0]> = {};
        for (const h of existing.history) histByDate[h.date] = { ...h };
        for (const h of t.history) {
          if (histByDate[h.date]) {
            histByDate[h.date].dollar_flow += h.dollar_flow;
            histByDate[h.date].shares_delta += h.shares_delta;
            // Keep the non-UNCHANGED flow_type
            if (h.flow_type !== "UNCHANGED") histByDate[h.date].flow_type = h.flow_type;
          } else {
            histByDate[h.date] = { ...h };
          }
        }
        existing.history = Object.values(histByDate).sort((a, b) => a.date.localeCompare(b.date));
        // Use most recent streak magnitude
        if (Math.abs(t.current_streak) > Math.abs(existing.current_streak)) {
          existing.current_streak = t.current_streak;
        }
      }
    }
  }
  return Object.values(byIsin);
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function FlowsPage({
  searchParams,
}: {
  searchParams: { date?: string; etf?: string; tab?: string; window?: string; tetf?: string };
}) {
  const tab: Tab = searchParams.tab === "trends" ? "trends" : "flows";

  // Flows ETF — must be a specific ETF
  const flowsEtf = (SUPPORTED_ETFS.includes(searchParams.etf as EtfTicker)
    ? searchParams.etf
    : "PFF") as EtfTicker;

  // Trends ETF — can be a specific ETF or "ALL"
  const rawTetf = searchParams.tetf ?? "ALL";
  const trendsEtf: TrendsEtf = rawTetf === "ALL" || SUPPORTED_ETFS.includes(rawTetf as EtfTicker)
    ? (rawTetf as TrendsEtf)
    : "ALL";
  const trendsEtfList: EtfTicker[] = trendsEtf === "ALL" ? [...SUPPORTED_ETFS] : [trendsEtf];

  const windowDays = parseInt(searchParams.window ?? "30", 10);

  // Flows data
  const flowDates = listFlowDates(flowsEtf);
  const selectedDate = searchParams.date ?? flowDates[0];
  const flows = selectedDate ? loadFlows(selectedDate, flowsEtf) : [];

  const dateIdx = selectedDate ? flowDates.indexOf(selectedDate) : -1;
  const prevDate = dateIdx >= 0 && dateIdx < flowDates.length - 1 ? flowDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? flowDates[dateIdx - 1] : null;

  const changes = flows.filter((f) => f.flow_type !== "UNCHANGED");
  const buyDollars = changes
    .filter((f) => f.flow_type === "BUY" || f.flow_type === "ADDED")
    .reduce((s, f) => s + (f.dollar_flow ?? 0), 0);
  const sellDollars = changes
    .filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED")
    .reduce((s, f) => s + Math.abs(f.dollar_flow ?? 0), 0);

  // Trends data
  const allDays = aggregateDays(trendsEtfList);
  const recentDays = allDays.slice(-windowDays);
  const windowStart = recentDays[0]?.date ?? "";

  const allTickers = aggregateTickers(trendsEtfList);
  const activeTickers = allTickers.filter((t) => t.history.some((h) => h.date >= windowStart));

  const tickersWithStats = activeTickers.map((t) => {
    const wh = t.history.filter((h) => h.date >= windowStart);
    return {
      ...t,
      windowBuyDays: wh.filter((h) => h.flow_type === "BUY" || h.flow_type === "ADDED").length,
      windowSellDays: wh.filter((h) => h.flow_type === "SELL" || h.flow_type === "REMOVED").length,
      windowNetDollars: wh.reduce((s, h) => s + (h.dollar_flow ?? 0), 0),
    };
  });

  const underPressure = [...tickersWithStats]
    .filter((t) => t.windowSellDays > 0)
    .sort((a, b) => {
      const as_ = a.current_streak < 0 ? Math.abs(a.current_streak) : 0;
      const bs_ = b.current_streak < 0 ? Math.abs(b.current_streak) : 0;
      return bs_ !== as_ ? bs_ - as_ : b.windowSellDays - a.windowSellDays;
    })
    .slice(0, 30);

  const beingAccumulated = [...tickersWithStats]
    .filter((t) => t.windowBuyDays > 0)
    .sort((a, b) => {
      const as_ = a.current_streak > 0 ? a.current_streak : 0;
      const bs_ = b.current_streak > 0 ? b.current_streak : 0;
      return bs_ !== as_ ? bs_ - as_ : b.windowBuyDays - a.windowBuyDays;
    })
    .slice(0, 30);

  const windows = [10, 30, 60, 90];

  const BTN_ACTIVE = "border-gray-800 bg-gray-900 text-white font-bold";
  const BTN_INACTIVE = "border-gray-500 text-gray-600 hover:border-gray-400 hover:text-gray-900";

  const TAB_ACTIVE = "border-b-2 border-blue-800 bg-white text-gray-900 font-bold";
  const TAB_INACTIVE = "text-gray-600 hover:bg-gray-100 hover:text-gray-900";

  function flowsTabHref(e: EtfTicker) {
    return `/flows?etf=${e}&tab=flows${selectedDate ? `&date=${selectedDate}` : ""}`;
  }
  function trendsTabHref(te: TrendsEtf, w?: number) {
    return `/flows?etf=${flowsEtf}&tab=trends&tetf=${te}&window=${w ?? windowDays}`;
  }

  return (
    <div className="space-y-4">
      {/* Tab bar — top level */}
      <div className="flex gap-0.5 border-b-2 border-gray-600">
        <a href={`/flows?etf=${flowsEtf}&tab=flows${selectedDate ? `&date=${selectedDate}` : ""}`}
          className={`px-5 py-2 font-mono text-xs ${tab === "flows" ? TAB_ACTIVE : TAB_INACTIVE}`}>
          Flows
        </a>
        <a href={`/flows?etf=${flowsEtf}&tab=trends&tetf=${trendsEtf}&window=${windowDays}`}
          className={`px-5 py-2 font-mono text-xs ${tab === "trends" ? TAB_ACTIVE : TAB_INACTIVE}`}>
          Trends
        </a>
      </div>

      {/* ── FLOWS TAB ── */}
      {tab === "flows" && (
        <div className="space-y-4">
          {/* ETF + date controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {SUPPORTED_ETFS.map((e) => (
                <a key={e} href={flowsTabHref(e)}
                  className={`border px-2.5 py-1 font-mono text-xs ${flowsEtf === e ? BTN_ACTIVE : BTN_INACTIVE}`}>
                  {e}
                </a>
              ))}
            </div>
            {selectedDate && (
              <DateNav
                selectedDate={selectedDate}
                prevDate={prevDate}
                nextDate={nextDate}
                etf={flowsEtf}
                allDates={flowDates}
                basePath="/flows"
                extraParams="tab=flows"
              />
            )}
            {changes.length > 0 && (
              <span className="font-mono text-xs text-gray-500">
                <span className="text-emerald-600">{fmtDollar(buyDollars)} bought</span>
                {" · "}
                <span className="text-rose-500">{fmtDollar(sellDollars)} sold</span>
                {" · "}
                <span>{changes.length} changes</span>
              </span>
            )}
          </div>

          {/* Sector chart */}
          {flows.length > 0 && (
            <div className="border-2 border-gray-600 bg-white p-4">
              <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Sector Flow (net $) — {flowsEtf} {selectedDate}
              </p>
              <SectorFlowChart flows={flows} />
            </div>
          )}

          {/* Flows table */}
          {flows.length === 0 ? (
            <div className="border border-gray-500 px-6 py-12 text-center font-mono text-xs text-gray-400">
              no flow data for this date
            </div>
          ) : (
            <div className="border-2 border-gray-600 bg-white p-4">
              <FlowsTable flows={flows} showAll />
            </div>
          )}
        </div>
      )}

      {/* ── TRENDS TAB ── */}
      {tab === "trends" && (
        <div className="space-y-5">
          {/* ETF picker + window picker */}
          <div className="flex flex-wrap items-center gap-3">
            {/* ETF / ALL selector */}
            <div className="flex gap-1">
              <a href={trendsTabHref("ALL")}
                className={`border px-2.5 py-1 font-mono text-xs ${trendsEtf === "ALL" ? BTN_ACTIVE : BTN_INACTIVE}`}>
                All ETFs
              </a>
              {SUPPORTED_ETFS.map((e) => (
                <a key={e} href={trendsTabHref(e)}
                  className={`border px-2.5 py-1 font-mono text-xs ${trendsEtf === e ? BTN_ACTIVE : BTN_INACTIVE}`}>
                  {e}
                </a>
              ))}
            </div>

            {/* Window picker */}
            <div className="ml-auto flex gap-1">
              {windows.map((w) => (
                <a key={w} href={trendsTabHref(trendsEtf, w)}
                  className={`border px-2.5 py-1 font-mono text-xs ${windowDays === w ? BTN_ACTIVE : BTN_INACTIVE}`}>
                  {w}d
                </a>
              ))}
            </div>

            <span className="font-mono text-xs text-gray-500">
              {recentDays.length} trading days · {activeTickers.length} positions
              {trendsEtf === "ALL" && <span className="ml-1 text-gray-400">(all ETFs combined)</span>}
            </span>
          </div>

          <section>
            <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Daily Activity
            </h2>
            <DailyActivityTable days={recentDays} />
          </section>

          <section>
            <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Sector Rotation — {windowDays}d net flow
            </h2>
            <SectorRotation days={recentDays} />
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-500">
                Under Pressure
              </h2>
              <PressureLeaderboard tickers={underPressure} mode="sell" windowDays={windowDays} />
            </section>
            <section>
              <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                Being Accumulated
              </h2>
              <PressureLeaderboard tickers={beingAccumulated} mode="buy" windowDays={windowDays} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
