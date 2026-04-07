import {
  buildFlowHistory,
  listFlowDates,
  loadFlows,
  loadHoldings,
  listHoldingDates,
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import type { EtfTicker } from "@/src/lib/data";
import type { FlowRow } from "@/src/types/pff";
import { FlowChart } from "@/src/components/FlowChart";
import { FlowsTable } from "@/src/components/FlowsTable";
import { OpportunitiesTable } from "@/src/components/OpportunitiesTable";
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
  // Use PFF as the date authority (most complete history)
  const pffDates = listFlowDates("PFF");
  const selectedDate = searchParams.date ?? pffDates[0];

  const dateIdx = selectedDate ? pffDates.indexOf(selectedDate) : -1;
  const prevDate = dateIdx >= 0 && dateIdx < pffDates.length - 1 ? pffDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? pffDates[dateIdx - 1] : null;

  // Load flows for each ETF and tag with etf name
  const allFlows: FlowRow[] = [];
  for (const etf of SUPPORTED_ETFS) {
    const etfDates = listFlowDates(etf);
    // Find the closest available date for this ETF
    const date = etfDates.includes(selectedDate ?? "") ? selectedDate! : etfDates[0];
    if (date) {
      const flows = loadFlows(date, etf).map((f) => ({ ...f, etf }));
      allFlows.push(...flows);
    }
  }

  // Holdings from PFF only (for AUM / security count)
  const holdingDates = listHoldingDates("PFF");
  const holdings = holdingDates[0] ? loadHoldings(holdingDates[0], "PFF") : [];

  // 30-day chart from PFF (most history)
  const flowHistory = buildFlowHistory(30, "PFF");

  const changes = allFlows.filter((f) => f.flow_type !== "UNCHANGED");
  const buys = changes.filter((f) => f.flow_type === "BUY" || f.flow_type === "ADDED");
  const sells = changes.filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED");
  const buyDollars = buys.reduce((s, f) => s + (f.dollar_flow ?? 0), 0);
  const sellDollars = sells.reduce((s, f) => s + Math.abs(f.dollar_flow ?? 0), 0);

  const aum = holdings.reduce((sum, h) => sum + (h.mkt_val ?? 0), 0);

  const topSignal = allFlows
    .filter((f) => (f.signal_score ?? 0) > 0)
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))[0];

  const etfsWithData = SUPPORTED_ETFS.filter((etf) => listFlowDates(etf).length > 0);

  const stats = [
    {
      label: "PFF AUM",
      value: fmtDollar.format(aum),
      sub: `as of ${holdingDates[0] ?? "—"}`,
    },
    {
      label: "ETFs tracked",
      value: etfsWithData.length.toString(),
      sub: etfsWithData.join(" · "),
    },
    {
      label: "Buy Flow",
      value: fmtDollar.format(buyDollars),
      sub: `${buys.length} positions`,
      color: "text-green-700",
    },
    {
      label: "Sell Flow",
      value: fmtDollar.format(sellDollars),
      sub: `${sells.length} positions`,
      color: "text-red-700",
    },
  ];

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
          All ETFs · {SUPPORTED_ETFS.join(" + ")}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color ?? ""}`}>
              {s.value}
            </p>
            <p className="text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Buy-the-dip opportunities */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Buy-the-Dip Opportunities
          </h2>
          <span className="text-xs text-slate-400">{selectedDate}</span>
          {topSignal && (
            <span className="text-xs font-medium text-green-700">
              Top signal: {topSignal.ticker} ({topSignal.etf}, score {topSignal.signal_score?.toFixed(1)})
            </span>
          )}
        </div>
        <OpportunitiesTable flows={allFlows} />
      </section>

      {/* 30-day flow history chart */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          30-Day Net Flow Activity · PFF
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <FlowChart history={flowHistory} selectedDate={selectedDate} etf="PFF" />
        </div>
      </section>

      {/* All flow changes — all ETFs stacked */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            All Rebalancing Flows
          </h2>
          <span className="text-xs text-slate-400">{selectedDate} · all ETFs</span>
        </div>

        {changes.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-slate-400">
            No flow data yet. The GitHub Actions job will populate this after
            the first two consecutive trading days of data are scraped.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <FlowsTable flows={allFlows} showEtf />
          </div>
        )}
      </section>
    </div>
  );
}
