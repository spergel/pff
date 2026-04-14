import { fmtDollar, fmtNum } from "@/src/lib/fmt";
import {
  buildFlowHistory,
  buildConsensusHistory,
  listFlowDates,
  loadFlows,
  loadHoldings,
  listHoldingDates,
  loadOverlapSummary,
  computeConsensus,
  loadTickerSummary,
  loadDescMap,
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import type { ConsensusFrequencyRow } from "@/src/lib/data";
import type { ConsensusRow, FlowRow, TickerAggregate } from "@/src/types/pff";
import { FlowChart } from "@/src/components/FlowChart";
import { FlowMosaic } from "@/src/components/FlowMosaic";
import type { MosaicTile } from "@/src/components/FlowMosaic";
import { EtfSummaryStrip } from "@/src/components/EtfSummaryStrip";
import type { EtfStat } from "@/src/components/EtfSummaryStrip";
import { DateNav } from "@/src/components/DateNav";
import { SignalBadge } from "@/src/components/SignalBadge";

// ─── rebalancing countdown ─────────────────────────────────────────────────

function getNextRebalance(): { label: string; daysLeft: number } {
  const now = new Date();
  const y = now.getFullYear();

  function lastTradingDay(year: number, month: number): Date {
    const last = new Date(year, month, 0);
    const dow = last.getDay();
    if (dow === 0) last.setDate(last.getDate() - 2);
    else if (dow === 6) last.setDate(last.getDate() - 1);
    return last;
  }

  const candidates = [
    lastTradingDay(y, 3),
    lastTradingDay(y, 6),
    lastTradingDay(y, 9),
    lastTradingDay(y, 12),
    lastTradingDay(y + 1, 3),
  ];

  const next = candidates.find((d) => d > now);
  if (!next) return { label: "Unknown", daysLeft: 0 };

  const daysLeft = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = next.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return { label, daysLeft };
}

// ─── ETF badge styles ──────────────────────────────────────────────────────

const ETF_BADGE: Record<string, string> = {
  PFF: "bg-blue-100 text-blue-800",
  PGX: "bg-purple-100 text-purple-700",
  FPE: "bg-amber-100 text-amber-700",
  PFFA: "bg-green-100 text-green-700",
};

// ─── consensus panels ──────────────────────────────────────────────────────

function MiniConsensus({ rows }: { rows: ConsensusRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center font-mono text-xs text-gray-400">
        no cross-ETF consensus today
      </p>
    );
  }
  return (
    <div className="space-y-px">
      {rows.map((row) => {
        const isBuy = row.consensus === "BUY";
        return (
          <div
            key={row.cusip}
            className={`flex items-center gap-2 px-2 py-1.5 text-xs ${isBuy ? "bg-emerald-50" : "bg-rose-50"}`}
          >
            <span className={`shrink-0 font-mono font-bold w-8 ${isBuy ? "text-emerald-600" : "text-rose-500"}`}>
              {row.etf_count === 3 ? "⚡" : isBuy ? "▲" : "▼"}
            </span>
            <span className="font-mono font-semibold text-gray-900 w-16 shrink-0">{row.ticker || "—"}</span>
            <span className="truncate text-gray-500 flex-1 min-w-0 text-[10px]">{row.name}</span>
            <div className="flex gap-0.5 shrink-0">
              {row.etfs.map((etf) => (
                <span key={etf} className={`px-1 py-0.5 text-[10px] font-semibold ${ETF_BADGE[etf] ?? "bg-gray-100 text-gray-500"}`}>
                  {etf}
                </span>
              ))}
            </div>
            <span className={`font-mono font-medium shrink-0 ${isBuy ? "text-emerald-600" : "text-rose-500"}`}>
              {fmtDollar(row.combined_flow)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RecurringConsensus({ rows }: { rows: ConsensusFrequencyRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center font-mono text-xs text-gray-400">
        no recurring consensus in the last 14 days
      </p>
    );
  }
  return (
    <div className="space-y-px">
      {rows.slice(0, 12).map((row) => {
        const isBuy = row.recentConsensus === "BUY";
        const totalDays = row.buyDays + row.sellDays;
        return (
          <div key={row.cusip} className="flex items-center gap-2 px-2 py-1.5 hover:bg-yellow-50">
            <span className={`shrink-0 font-mono font-bold w-8 text-xs ${isBuy ? "text-emerald-600" : "text-rose-500"}`}>
              {isBuy ? "▲" : "▼"}
            </span>
            <span className="font-mono font-semibold text-gray-900 w-16 shrink-0 text-xs">{row.ticker || "—"}</span>
            <span className="truncate text-gray-500 flex-1 min-w-0 text-[10px]">{row.name}</span>
            <div className="flex gap-0.5 shrink-0">
              {Array.from({ length: totalDays }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2.5 w-2 ${i < row.buyDays ? "bg-emerald-400" : "bg-rose-400"}`}
                  title={i < row.buyDays ? "consensus BUY" : "consensus SELL"}
                />
              ))}
            </div>
            <span className="font-mono text-[10px] text-gray-400 shrink-0 w-6 text-right">{totalDays}d</span>
            <div className="flex gap-0.5 shrink-0">
              {row.etfs.map((etf) => (
                <span key={etf} className={`px-1 py-0.5 text-[10px] font-semibold ${ETF_BADGE[etf] ?? "bg-gray-100 text-gray-500"}`}>
                  {etf}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── signals panel ─────────────────────────────────────────────────────────

type SignalView = "sells_dollar" | "sells_vol" | "buys_monthly" | "mosaic";
type VolPeriod = "daily" | "weekly" | "monthly";
type MosaicPeriod = "week" | "month";

const VOL_PERIOD_DAYS: Record<VolPeriod, number> = { daily: 1, weekly: 5, monthly: 21 };

interface MonthlyBuyRow extends TickerAggregate {
  etf: string;
  windowBuyDollars: number;
  windowBuyDays: number;
}

function SellsDollarTable({ flows }: { flows: FlowRow[] }) {
  const rows = flows
    .filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED")
    .sort((a, b) => Math.abs(b.dollar_flow ?? 0) - Math.abs(a.dollar_flow ?? 0))
    .slice(0, 15);

  if (!rows.length) return <p className="py-6 text-center font-mono text-xs text-gray-400">no sell data today</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-600 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">ETF</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">$ Sold</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Sector</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((row, i) => (
            <tr key={`${row.etf}-${row.isin}-${i}`} className="hover:bg-yellow-50">
              <td className="px-3 py-2 font-mono font-semibold text-gray-900">{row.ticker}</td>
              <td className="max-w-[160px] truncate px-3 py-2 text-xs text-gray-600">{row.name}</td>
              <td className="px-3 py-2">
                <span className={`px-1.5 py-0.5 text-[10px] font-semibold ${ETF_BADGE[row.etf ?? ""] ?? "bg-gray-100 text-gray-500"}`}>
                  {row.etf}
                </span>
              </td>
              <td className="px-3 py-2"><SignalBadge type={row.flow_type} /></td>
              <td className="px-3 py-2 font-mono text-xs font-medium text-rose-500">
                {row.dollar_flow != null ? fmtDollar(Math.abs(row.dollar_flow)) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-gray-600">
                {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-gray-500">{row.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SellsVolTable({ flows, period }: { flows: FlowRow[]; period: VolPeriod }) {
  const periodDays = VOL_PERIOD_DAYS[period];
  const rows = flows
    .filter((f) => (f.flow_type === "SELL" || f.flow_type === "REMOVED") && f.overhang_days != null)
    .map((f) => ({ ...f, pctVol: ((f.overhang_days ?? 0) / periodDays) * 100 }))
    .sort((a, b) => b.pctVol - a.pctVol)
    .slice(0, 15);

  if (!rows.length) return <p className="py-6 text-center font-mono text-xs text-gray-400">no ADV data for sells today</p>;

  const periodLabel = period === "daily" ? "Daily ADV" : period === "weekly" ? "Weekly ADV" : "Monthly ADV";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-600 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">ETF</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">% {periodLabel}</th>
            <th className="px-3 py-2">$ Sold</th>
            <th className="px-3 py-2">Sector</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((row, i) => {
            const pctBar = Math.min(100, row.pctVol / 5); // scale: 500% = full bar
            return (
              <tr key={`${row.etf}-${row.isin}-${i}`} className="hover:bg-yellow-50">
                <td className="px-3 py-2 font-mono font-semibold text-gray-900">{row.ticker}</td>
                <td className="max-w-[160px] truncate px-3 py-2 text-xs text-gray-600">{row.name}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 text-[10px] font-semibold ${ETF_BADGE[row.etf ?? ""] ?? "bg-gray-100 text-gray-500"}`}>
                    {row.etf}
                  </span>
                </td>
                <td className="px-3 py-2"><SignalBadge type={row.flow_type} /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 bg-gray-200">
                      <div className="h-1.5 bg-rose-500" style={{ width: `${pctBar}%` }} />
                    </div>
                    <span className="font-mono text-xs font-medium text-rose-500">
                      {row.pctVol.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-rose-500">
                  {row.dollar_flow != null ? fmtDollar(Math.abs(row.dollar_flow)) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{row.sector}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-gray-400 px-3 py-2 font-mono text-[10px] text-gray-400">
        overhang_days = $ sold ÷ 30d ADV · % {periodLabel.toLowerCase()} = overhang ÷ {periodDays} trading days
      </div>
    </div>
  );
}

function BuysMonthlyTable({ rows }: { rows: MonthlyBuyRow[] }) {
  if (!rows.length) return <p className="py-6 text-center font-mono text-xs text-gray-400">no buy data in the last 30 days</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-600 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">ETF</th>
            <th className="px-3 py-2">$ Bought (30d)</th>
            <th className="px-3 py-2">Buy Days</th>
            <th className="px-3 py-2">Streak</th>
            <th className="px-3 py-2">Sector</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((row, i) => (
            <tr key={`${row.etf}-${row.isin}-${i}`} className="hover:bg-yellow-50">
              <td className="px-3 py-2 font-mono font-semibold text-gray-900">{row.ticker}</td>
              <td className="max-w-[160px] truncate px-3 py-2 text-xs text-gray-600">{row.name}</td>
              <td className="px-3 py-2">
                <span className={`px-1.5 py-0.5 text-[10px] font-semibold ${ETF_BADGE[row.etf] ?? "bg-gray-100 text-gray-500"}`}>
                  {row.etf}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs font-medium text-emerald-600">
                {fmtDollar(row.windowBuyDollars)}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-emerald-600">
                {row.windowBuyDays}d
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {row.current_streak > 0 ? (
                  <span className="text-emerald-600">BUY ×{row.current_streak}</span>
                ) : row.current_streak < 0 ? (
                  <span className="text-rose-500">SELL ×{Math.abs(row.current_streak)}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-gray-500">{row.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { date?: string; etf?: string; view?: string; period?: string; mosaic_period?: string };
}) {
  const pffDates = listFlowDates("PFF");
  const selectedDate = searchParams.date ?? pffDates[0];

  const dateIdx = selectedDate ? pffDates.indexOf(selectedDate) : -1;
  const prevDate = dateIdx >= 0 && dateIdx < pffDates.length - 1 ? pffDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? pffDates[dateIdx - 1] : null;

  const view: SignalView =
    searchParams.view === "sells_vol" ? "sells_vol"
    : searchParams.view === "buys_monthly" ? "buys_monthly"
    : searchParams.view === "mosaic" ? "mosaic"
    : "sells_dollar";

  const period: VolPeriod =
    searchParams.period === "weekly" ? "weekly"
    : searchParams.period === "monthly" ? "monthly"
    : "daily";

  const mosaicPeriod: MosaicPeriod =
    searchParams.mosaic_period === "week" ? "week" : "month";

  // Load flows for each ETF
  const allFlows: FlowRow[] = [];
  const etfStats: EtfStat[] = [];

  for (const etf of SUPPORTED_ETFS) {
    const etfDates = listFlowDates(etf);
    const date = etfDates.includes(selectedDate ?? "") ? selectedDate! : etfDates[0];

    if (!date) {
      etfStats.push({ etf, date: null, buys: 0, sells: 0, buy_dollars: 0, sell_dollars: 0, num_changes: 0 });
      continue;
    }

    const flows = loadFlows(date, etf).map((f) => ({ ...f, etf }));
    allFlows.push(...flows);

    const changes = flows.filter((f) => f.flow_type !== "UNCHANGED");
    const buys = changes.filter((f) => f.flow_type === "BUY" || f.flow_type === "ADDED");
    const sells = changes.filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED");

    etfStats.push({
      etf,
      date,
      buys: buys.length,
      sells: sells.length,
      buy_dollars: buys.reduce((s, f) => s + (f.dollar_flow ?? 0), 0),
      sell_dollars: sells.reduce((s, f) => s + Math.abs(f.dollar_flow ?? 0), 0),
      num_changes: changes.length,
    });
  }

  const totalBuyDollars = etfStats.reduce((s, e) => s + e.buy_dollars, 0);
  const totalSellDollars = etfStats.reduce((s, e) => s + e.sell_dollars, 0);

  // PFF AUM
  const holdingDates = listHoldingDates("PFF");
  const holdings = holdingDates[0] ? loadHoldings(holdingDates[0], "PFF") : [];
  const aum = holdings.reduce((sum, h) => sum + (h.mkt_val ?? 0), 0);

  // Today's cross-ETF consensus
  const overlap = loadOverlapSummary();
  const consensusRows = selectedDate ? computeConsensus(selectedDate, overlap) : [];
  const consensusBuys = consensusRows.filter((r) => r.consensus === "BUY").length;
  const consensusSells = consensusRows.filter((r) => r.consensus === "SELL").length;

  // 30-day chart data
  const pffHistory = buildFlowHistory(30, "PFF");
  const pgxHistory = buildFlowHistory(30, "PGX");
  const fpeHistory = buildFlowHistory(30, "FPE");
  const pffaHistory = buildFlowHistory(30, "PFFA");

  // Recurring consensus (last 14 trading days)
  const recurringRows = buildConsensusHistory(14);

  // Rebalancing countdown
  const rebalance = getNextRebalance();

  const etfsWithData = SUPPORTED_ETFS.filter((etf) => listFlowDates(etf).length > 0);

  // Monthly buys (last 30 days across all ETFs)
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const monthlyBuyRows: MonthlyBuyRow[] = [];
  for (const etf of SUPPORTED_ETFS) {
    const summary = loadTickerSummary(etf);
    for (const t of Object.values(summary)) {
      const windowHistory = t.history.filter(
        (h) => h.date >= windowStart && (h.flow_type === "BUY" || h.flow_type === "ADDED")
      );
      const windowBuyDollars = windowHistory.reduce((s, h) => s + h.dollar_flow, 0);
      if (windowBuyDollars > 0) {
        monthlyBuyRows.push({ ...t, etf, windowBuyDollars, windowBuyDays: windowHistory.length });
      }
    }
  }
  monthlyBuyRows.sort((a, b) => b.windowBuyDollars - a.windowBuyDollars);
  const top15Buys = monthlyBuyRows.slice(0, 15);

  // Mosaic: aggregate net flow per ticker over the selected window
  const descMap = loadDescMap();
  const mosaicWindowDays = mosaicPeriod === "week" ? 5 : 21;
  const mosaicStart = new Date(Date.now() - mosaicWindowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const mosaicMap = new Map<string, MosaicTile>();
  for (const etf of SUPPORTED_ETFS) {
    const summary = loadTickerSummary(etf);
    for (const t of Object.values(summary)) {
      const window = t.history.filter((h) => h.date >= mosaicStart && h.flow_type !== "UNCHANGED" && h.flow_type !== "SUSPECT");
      if (!window.length) continue;
      const buys = window.filter((h) => h.flow_type === "BUY" || h.flow_type === "ADDED").reduce((s, h) => s + h.dollar_flow, 0);
      const sells = window.filter((h) => h.flow_type === "SELL" || h.flow_type === "REMOVED").reduce((s, h) => s + Math.abs(h.dollar_flow), 0);
      const net = buys - sells;
      if (Math.abs(net) < 10_000) continue; // skip noise
      const key = t.ticker || t.isin;
      const existing = mosaicMap.get(key);
      if (existing) {
        existing.buys += buys;
        existing.sells += sells;
        existing.net += net;
        existing.days += window.length;
        if (!existing.etfs.includes(etf)) existing.etfs.push(etf);
      } else {
        mosaicMap.set(key, {
          ticker: t.ticker,
          desc: descMap.get(t.isin) ?? null,
          name: t.name,
          net,
          buys,
          sells,
          days: window.length,
          etfs: [etf],
        });
      }
    }
  }
  const mosaicTiles = Array.from(mosaicMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  // Tab href helpers
  function viewHref(v: string, p?: string) {
    const base = `/?${selectedDate ? `date=${selectedDate}&` : ""}view=${v}`;
    return p ? `${base}&period=${p}` : base;
  }
  function mosaicHref(mp: MosaicPeriod) {
    return `/?${selectedDate ? `date=${selectedDate}&` : ""}view=mosaic&mosaic_period=${mp}`;
  }

  const TAB_ACTIVE = "border-b-2 border-blue-800 bg-white text-gray-900 font-bold";
  const TAB_INACTIVE = "text-gray-600 hover:bg-gray-100 hover:text-gray-900";

  return (
    <div className="space-y-4">
      {/* Row 1: Date nav + stat chips + rebalance countdown */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {selectedDate && pffDates.length > 0 && (
          <DateNav
            selectedDate={selectedDate}
            prevDate={prevDate}
            nextDate={nextDate}
            etf="PFF"
            allDates={pffDates}
            basePath="/"
          />
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
          <span className="text-gray-500">
            AUM <span className="text-gray-900 font-semibold">{fmtDollar(aum)}</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-emerald-600">▲ {fmtDollar(totalBuyDollars)}</span>
          <span className="text-rose-500">▼ {fmtDollar(totalSellDollars)}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">{etfsWithData.join(" · ")}</span>
        </div>

        {/* Rebalancing countdown */}
        <div className={`ml-auto flex items-center gap-1.5 border px-3 py-1 font-mono text-xs ${
          rebalance.daysLeft <= 14
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-gray-600 bg-gray-100 text-gray-600"
        }`}>
          <span className={rebalance.daysLeft <= 14 ? "text-amber-500" : "text-gray-400"}>⊙</span>
          <span>ICE rebalance</span>
          <span className={`font-semibold ${rebalance.daysLeft <= 14 ? "text-amber-700" : "text-gray-700"}`}>
            {rebalance.label}
          </span>
          <span className={rebalance.daysLeft <= 14 ? "text-amber-600" : "text-gray-400"}>
            ({rebalance.daysLeft}d)
          </span>
        </div>
      </div>

      {/* Row 2: ETF summary strips */}
      <EtfSummaryStrip stats={etfStats} />

      {/* Row 3: Chart + Today's Consensus */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="border-2 border-gray-600 bg-white p-4 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              30-Day Net Flow
            </span>
            <span className="font-mono text-[10px] text-gray-400">click bar to navigate</span>
          </div>
          <FlowChart
            history={pffHistory}
            auxHistories={{ PGX: pgxHistory, FPE: fpeHistory, PFFA: pffaHistory }}
            selectedDate={selectedDate}
            etf="PFF"
          />
        </div>

        <div className="border-2 border-gray-600 bg-white p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Cross-ETF Consensus
            </span>
            {consensusRows.length > 0 && (
              <span className="font-mono text-[10px] text-gray-500">
                <span className="text-emerald-600">{consensusBuys}b</span>
                {" · "}
                <span className="text-rose-500">{consensusSells}s</span>
              </span>
            )}
          </div>
          <MiniConsensus rows={consensusRows} />
        </div>
      </div>

      {/* Row 4: Recurring consensus (14d) */}
      <div className="border-2 border-gray-600 bg-white p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Recurring Consensus
          </span>
          <span className="font-mono text-[10px] text-gray-400">
            last 14 trading days · {recurringRows.length} securities with 2+ consensus days
          </span>
        </div>
        <RecurringConsensus rows={recurringRows} />
      </div>

      {/* Row 5: Signals panel */}
      <div className="border-2 border-gray-600 bg-white">
        {/* Tab bar */}
        <div className="flex gap-0.5 border-b-2 border-gray-600 px-4">
          <a href={viewHref("sells_dollar")} className={`px-4 py-2 font-mono text-xs capitalize ${view === "sells_dollar" ? TAB_ACTIVE : TAB_INACTIVE}`}>
            Largest Sold ($)
          </a>
          <a href={viewHref("sells_vol", period)} className={`px-4 py-2 font-mono text-xs capitalize ${view === "sells_vol" ? TAB_ACTIVE : TAB_INACTIVE}`}>
            Sold (% Vol)
          </a>
          <a href={viewHref("buys_monthly")} className={`px-4 py-2 font-mono text-xs capitalize ${view === "buys_monthly" ? TAB_ACTIVE : TAB_INACTIVE}`}>
            Most Bought (30d)
          </a>
          <a href={mosaicHref(mosaicPeriod)} className={`px-4 py-2 font-mono text-xs capitalize ${view === "mosaic" ? TAB_ACTIVE : TAB_INACTIVE}`}>
            Mosaic
          </a>

          {/* Period picker — only for sells_vol */}
          {view === "sells_vol" && (
            <div className="ml-auto flex items-center gap-1 py-1">
              {(["daily", "weekly", "monthly"] as VolPeriod[]).map((p) => (
                <a
                  key={p}
                  href={viewHref("sells_vol", p)}
                  className={`border px-2.5 py-1 font-mono text-[10px] ${
                    period === p
                      ? "border-gray-800 bg-gray-900 text-white font-bold"
                      : "border-gray-500 text-gray-500 hover:border-gray-400 hover:text-gray-900"
                  }`}
                >
                  {p}
                </a>
              ))}
            </div>
          )}

          {/* Period picker — only for mosaic */}
          {view === "mosaic" && (
            <div className="ml-auto flex items-center gap-1 py-1">
              {(["week", "month"] as MosaicPeriod[]).map((mp) => (
                <a
                  key={mp}
                  href={mosaicHref(mp)}
                  className={`border px-2.5 py-1 font-mono text-[10px] ${
                    mosaicPeriod === mp
                      ? "border-gray-800 bg-gray-900 text-white font-bold"
                      : "border-gray-500 text-gray-500 hover:border-gray-400 hover:text-gray-900"
                  }`}
                >
                  {mp}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Tab content */}
        <div className="p-4">
          {view === "sells_dollar" && <SellsDollarTable flows={allFlows} />}
          {view === "sells_vol" && <SellsVolTable flows={allFlows} period={period} />}
          {view === "buys_monthly" && <BuysMonthlyTable rows={top15Buys} />}
          {view === "mosaic" && <FlowMosaic tiles={mosaicTiles} period={mosaicPeriod} />}
        </div>
      </div>
    </div>
  );
}
