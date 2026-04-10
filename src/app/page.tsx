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
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import type { ConsensusFrequencyRow } from "@/src/lib/data";
import type { EtfTicker } from "@/src/lib/data";
import type { ConsensusRow, FlowRow } from "@/src/types/pff";
import { FlowChart } from "@/src/components/FlowChart";
import { OpportunitiesTable } from "@/src/components/OpportunitiesTable";
import { EtfSummaryStrip } from "@/src/components/EtfSummaryStrip";
import type { EtfStat } from "@/src/components/EtfSummaryStrip";
import { DateNav } from "@/src/components/DateNav";
import Link from "next/link";

// ─── formatters ────────────────────────────────────────────────────────────





// ─── rebalancing countdown ─────────────────────────────────────────────────

function getNextRebalance(): { label: string; daysLeft: number } {
  const now = new Date();
  const y = now.getFullYear();

  function lastTradingDay(year: number, month: number): Date {
    const last = new Date(year, month, 0); // last day of month
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

// ─── mini components ───────────────────────────────────────────────────────

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
            className={`flex items-center gap-2  px-2 py-1.5 text-xs ${
              isBuy ? "bg-emerald-50" : "bg-rose-50"
            }`}
          >
            <span className={`shrink-0 font-mono font-bold w-8 ${isBuy ? "text-emerald-600" : "text-rose-500"}`}>
              {row.etf_count === 3 ? "⚡" : isBuy ? "▲" : "▼"}
            </span>
            <span className="font-mono font-semibold text-gray-900 w-16 shrink-0">
              {row.ticker || "—"}
            </span>
            <span className="truncate text-gray-500 flex-1 min-w-0 text-[10px]">
              {row.name}
            </span>
            <div className="flex gap-0.5 shrink-0">
              {row.etfs.map((etf) => (
                <span key={etf} className={` px-1 py-0.5 text-[10px] font-semibold ${ETF_BADGE[etf] ?? "bg-gray-100 text-gray-500"}`}>
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
          <div
            key={row.cusip}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-yellow-50"
          >
            <span className={`shrink-0 font-mono font-bold w-8 text-xs ${isBuy ? "text-emerald-600" : "text-rose-500"}`}>
              {isBuy ? "▲" : "▼"}
            </span>
            <span className="font-mono font-semibold text-gray-900 w-16 shrink-0 text-xs">
              {row.ticker || "—"}
            </span>
            <span className="truncate text-gray-500 flex-1 min-w-0 text-[10px]">
              {row.name}
            </span>
            {/* Day frequency pills */}
            <div className="flex gap-0.5 shrink-0">
              {Array.from({ length: totalDays }).map((_, i) => {
                const isBuyDay = i < row.buyDays;
                return (
                  <div
                    key={i}
                    className={`h-2.5 w-2  ${isBuyDay ? "bg-emerald-400" : "bg-rose-400"}`}
                    title={isBuyDay ? "consensus BUY" : "consensus SELL"}
                  />
                );
              })}
            </div>
            <span className="font-mono text-[10px] text-gray-400 shrink-0 w-6 text-right">
              {totalDays}d
            </span>
            <div className="flex gap-0.5 shrink-0">
              {row.etfs.map((etf) => (
                <span key={etf} className={` px-1 py-0.5 text-[10px] font-semibold ${ETF_BADGE[etf] ?? "bg-gray-100 text-gray-500"}`}>
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

function ForcedBuyTable({ flows }: { flows: FlowRow[] }) {
  const rows = flows
    .filter((f) => (f.flow_type === "BUY" || f.flow_type === "ADDED") && f.adv_30d != null && f.overhang_days != null && (f.overhang_days ?? 0) > 0)
    .sort((a, b) => (b.overhang_days ?? 0) - (a.overhang_days ?? 0))
    .slice(0, 10);

  if (rows.length === 0) {
    return (
      <div className="border border-gray-500 px-6 py-8 text-center font-mono text-xs text-gray-400">
        no forced-buy signals with ADV data today
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-2 border-gray-600">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">$ Bought</th>
            <th className="px-3 py-2">Overhang</th>
            <th className="px-3 py-2">Price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((row) => {
            const pct = Math.min(100, ((row.overhang_days ?? 0) / 30) * 100);
            const barColor =
              (row.overhang_days ?? 0) >= 10
                ? "bg-emerald-500"
                : (row.overhang_days ?? 0) >= 3
                ? "bg-emerald-400"
                : "bg-emerald-300";
            return (
              <tr key={row.isin} className="hover:bg-yellow-50">
                <td className="px-3 py-2 font-mono font-semibold text-gray-900">{row.ticker}</td>
                <td className="max-w-[160px] truncate px-3 py-2 text-gray-600">{row.name}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block  px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    row.flow_type === "ADDED" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {row.flow_type}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-emerald-600">
                  {row.dollar_flow != null ? fmtDollar(row.dollar_flow) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 bg-gray-200">
                      <div className={`h-1.5  ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-xs text-gray-500">{(row.overhang_days ?? 0).toFixed(1)}d</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-gray-600">
                  {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-gray-400 px-3 py-2 font-mono text-[10px] text-gray-400">
        overhang = $ bought ÷ 30d ADV · ETF still needs to absorb this position · higher = stronger front-run opportunity
      </div>
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { date?: string; etf?: string };
}) {
  const pffDates = listFlowDates("PFF");
  const selectedDate = searchParams.date ?? pffDates[0];

  const dateIdx = selectedDate ? pffDates.indexOf(selectedDate) : -1;
  const prevDate = dateIdx >= 0 && dateIdx < pffDates.length - 1 ? pffDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? pffDates[dateIdx - 1] : null;

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
        <div className={`ml-auto flex items-center gap-1.5  border px-3 py-1 font-mono text-xs ${
          rebalance.daysLeft <= 14
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-gray-600 bg-gray-100 text-gray-600"
        }`}>
          <span className={rebalance.daysLeft <= 14 ? "text-amber-500" : "text-gray-400"}>⊙</span>
          <span>ICE rebalance</span>
          <span className={`font-semibold ${rebalance.daysLeft <= 14 ? "text-amber-700" : "text-gray-700"}`}>
            {rebalance.label}
          </span>
          <span className={`${rebalance.daysLeft <= 14 ? "text-amber-600" : "text-gray-400"}`}>
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
            <div className="flex items-center gap-2">
              {consensusRows.length > 0 && (
                <span className="font-mono text-[10px] text-gray-500">
                  <span className="text-emerald-600">{consensusBuys}b</span>
                  {" · "}
                  <span className="text-rose-500">{consensusSells}s</span>
                </span>
              )}
              <Link href={`/overlap?date=${selectedDate}`} className="font-mono text-[10px] text-blue-700 hover:text-blue-800">
                history →
              </Link>
            </div>
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
          <Link href="/overlap" className="ml-auto font-mono text-[10px] text-blue-700 hover:text-blue-800">
            all →
          </Link>
        </div>
        <RecurringConsensus rows={recurringRows} />
      </div>

      {/* Row 5: Front-Run + Buy-the-Dip signals */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="border-2 border-gray-600 bg-white p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Front-Run Signals
            </span>
            <span className="font-mono text-[10px] text-gray-400">forced buys by overhang</span>
          </div>
          <ForcedBuyTable flows={allFlows} />
        </div>

        <div className="border-2 border-gray-600 bg-white p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Buy-the-Dip Signals
            </span>
            <span className="font-mono text-[10px] text-gray-400">{selectedDate}</span>
            <Link href={`/flows?date=${selectedDate}`} className="ml-auto font-mono text-[10px] text-blue-700 hover:text-blue-800">
              full flows →
            </Link>
          </div>
          <OpportunitiesTable flows={allFlows} />
        </div>
      </div>
    </div>
  );
}
