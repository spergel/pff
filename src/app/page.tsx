import {
  buildFlowHistory,
  listFlowDates,
  loadFlows,
  loadHoldings,
  listHoldingDates,
  loadOverlapSummary,
  computeConsensus,
  loadDailySummary,
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import type { EtfTicker } from "@/src/lib/data";
import type { FlowRow } from "@/src/types/pff";
import { FlowChart } from "@/src/components/FlowChart";
import { OpportunitiesTable } from "@/src/components/OpportunitiesTable";
import { ConsensusTable } from "@/src/components/ConsensusTable";
import { EtfSummaryStrip } from "@/src/components/EtfSummaryStrip";
import type { EtfStat } from "@/src/components/EtfSummaryStrip";
import { DateNav } from "@/src/components/DateNav";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { date?: string; etf?: string };
}) {
  // PFF drives the date nav (most history)
  const pffDates = listFlowDates("PFF");
  const selectedDate = searchParams.date ?? pffDates[0];

  const dateIdx = selectedDate ? pffDates.indexOf(selectedDate) : -1;
  const prevDate = dateIdx >= 0 && dateIdx < pffDates.length - 1 ? pffDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? pffDates[dateIdx - 1] : null;

  // Load flows for each ETF and merge (for opportunities table)
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

  // Combined stats
  const totalBuyDollars = etfStats.reduce((s, e) => s + e.buy_dollars, 0);
  const totalSellDollars = etfStats.reduce((s, e) => s + e.sell_dollars, 0);

  // PFF AUM from latest holdings
  const holdingDates = listHoldingDates("PFF");
  const holdings = holdingDates[0] ? loadHoldings(holdingDates[0], "PFF") : [];
  const aum = holdings.reduce((sum, h) => sum + (h.mkt_val ?? 0), 0);

  // Cross-ETF consensus for selected date
  const overlap = loadOverlapSummary();
  const consensusRows = selectedDate ? computeConsensus(selectedDate, overlap) : [];

  // Best signal today (all ETFs)
  const topSignal = allFlows
    .filter((f) => (f.signal_score ?? 0) > 0)
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))[0];

  // 30-day chart data — all three ETFs
  const pffHistory = buildFlowHistory(30, "PFF");
  const pgxHistory = buildFlowHistory(30, "PGX");
  const fpeHistory = buildFlowHistory(30, "FPE");

  const etfsWithData = SUPPORTED_ETFS.filter((etf) => listFlowDates(etf).length > 0);

  return (
    <div className="space-y-8">
      {/* Date nav */}
      <div className="flex flex-wrap items-center gap-4">
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
        <span className="text-xs text-slate-400">
          {etfsWithData.join(" · ")} · all ETFs combined
        </span>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "PFF AUM", value: fmtDollar.format(aum), sub: `as of ${holdingDates[0] ?? "—"}` },
          { label: "ETFs Active", value: etfsWithData.length.toString(), sub: etfsWithData.join(" · ") },
          { label: "Combined Buy Flow", value: fmtDollar.format(totalBuyDollars), sub: "all ETFs", color: "text-green-700" },
          { label: "Combined Sell Flow", value: fmtDollar.format(totalSellDollars), sub: "all ETFs", color: "text-red-700" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color ?? ""}`}>{s.value}</p>
            <p className="text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Per-ETF summary strip */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          By ETF · {selectedDate}
        </h2>
        <EtfSummaryStrip stats={etfStats} />
      </section>

      {/* Cross-ETF consensus */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Cross-ETF Consensus
          </h2>
          <span className="text-xs text-slate-400">
            securities bought or sold by 2+ funds simultaneously
          </span>
          {consensusRows.length > 0 && (
            <span className="text-xs font-medium text-slate-600">
              {consensusRows.filter(r => r.consensus === "BUY").length} buys · {consensusRows.filter(r => r.consensus === "SELL").length} sells
            </span>
          )}
        </div>
        <ConsensusTable rows={consensusRows} />
      </section>

      {/* Buy-the-dip opportunities */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Buy-the-Dip Signals
          </h2>
          <span className="text-xs text-slate-400">{selectedDate}</span>
          {topSignal && (
            <span className="text-xs font-medium text-green-700">
              Top: {topSignal.ticker} ({topSignal.etf}, score {topSignal.signal_score?.toFixed(1)})
            </span>
          )}
        </div>
        <OpportunitiesTable flows={allFlows} />
      </section>

      {/* 30-day chart — multi-ETF */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          30-Day Net Flow Activity
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <FlowChart
            history={pffHistory}
            auxHistories={{ PGX: pgxHistory, FPE: fpeHistory }}
            selectedDate={selectedDate}
            etf="PFF"
          />
        </div>
      </section>
    </div>
  );
}
