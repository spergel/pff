import {
  buildFlowHistory,
  listFlowDates,
  loadFlows,
  loadHoldings,
  listHoldingDates,
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import type { EtfTicker } from "@/src/lib/data";
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
  const etf = (SUPPORTED_ETFS.includes(searchParams.etf as EtfTicker)
    ? searchParams.etf
    : "PFF") as EtfTicker;

  // dates is newest-first
  const flowDates = listFlowDates(etf);
  const holdingDates = listHoldingDates(etf);

  const selectedDate = searchParams.date ?? flowDates[0];

  const dateIdx = selectedDate ? flowDates.indexOf(selectedDate) : -1;
  const prevDate = dateIdx >= 0 && dateIdx < flowDates.length - 1 ? flowDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? flowDates[dateIdx - 1] : null;

  const flows = selectedDate ? loadFlows(selectedDate, etf) : [];
  const holdings = holdingDates[0] ? loadHoldings(holdingDates[0], etf) : [];

  const flowHistory = buildFlowHistory(30, etf);

  const changes = flows.filter((f) => f.flow_type !== "UNCHANGED");
  const buys = changes.filter((f) => f.flow_type === "BUY" || f.flow_type === "ADDED");
  const sells = changes.filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED");
  const buyDollars = buys.reduce((s, f) => s + (f.dollar_flow ?? 0), 0);
  const sellDollars = sells.reduce((s, f) => s + Math.abs(f.dollar_flow ?? 0), 0);

  const aum = holdings.reduce((sum, h) => sum + (h.mkt_val ?? 0), 0);

  const topSignal = flows
    .filter((f) => (f.signal_score ?? 0) > 0)
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))[0];

  const stats = [
    {
      label: "AUM (holdings sum)",
      value: fmtDollar.format(aum),
      sub: `as of ${holdingDates[0] ?? "—"}`,
    },
    {
      label: "Securities",
      value: holdings.length.toLocaleString(),
      sub: "in fund",
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
      {/* Header with ETF selector + date nav */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {SUPPORTED_ETFS.map((e) => (
            <a
              key={e}
              href={`/?etf=${e}`}
              className={`rounded border px-3 py-1 text-sm transition-colors ${
                etf === e
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              {e}
            </a>
          ))}
        </div>

        {selectedDate && flowDates.length > 0 && (
          <DateNav
            selectedDate={selectedDate}
            prevDate={prevDate}
            nextDate={nextDate}
            etf={etf}
            allDates={flowDates}
            basePath="/"
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
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
              Top signal: {topSignal.ticker} (score {topSignal.signal_score?.toFixed(1)})
            </span>
          )}
        </div>
        <OpportunitiesTable flows={flows} />
      </section>

      {/* 30-day flow history chart */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          30-Day Net Flow Activity
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <FlowChart history={flowHistory} selectedDate={selectedDate} etf={etf} />
        </div>
      </section>

      {/* All flow changes */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            All Rebalancing Flows
          </h2>
          <span className="text-xs text-slate-400">{selectedDate}</span>
        </div>

        {flows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-slate-400">
            No flow data yet. The GitHub Actions job will populate this after
            the first two consecutive trading days of data are scraped.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <FlowsTable flows={flows} />
          </div>
        )}
      </section>
    </div>
  );
}
