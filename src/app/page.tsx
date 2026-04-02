import {
  buildFlowHistory,
  loadLatestFlows,
  loadLatestHoldings,
} from "@/src/lib/data";
import { FlowChart } from "@/src/components/FlowChart";
import { FlowsTable } from "@/src/components/FlowsTable";
import { OpportunitiesTable } from "@/src/components/OpportunitiesTable";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export default function DashboardPage() {
  const latestHoldings = loadLatestHoldings();
  const latestFlows = loadLatestFlows();
  const flowHistory = buildFlowHistory(30);

  const holdingsDate = latestHoldings?.date ?? "—";
  const flowsDate = latestFlows?.date ?? "—";
  const totalHoldings = latestHoldings?.holdings.length ?? 0;

  const aum =
    latestHoldings?.holdings.reduce((sum, h) => sum + (h.mkt_val ?? 0), 0) ?? 0;

  const flows = latestFlows?.flows ?? [];
  const changes = flows.filter((f) => f.flow_type !== "UNCHANGED");
  const buys = changes.filter(
    (f) => f.flow_type === "BUY" || f.flow_type === "ADDED"
  );
  const sells = changes.filter(
    (f) => f.flow_type === "SELL" || f.flow_type === "REMOVED"
  );
  const buyDollars = buys.reduce((s, f) => s + (f.dollar_flow ?? 0), 0);
  const sellDollars = sells.reduce(
    (s, f) => s + Math.abs(f.dollar_flow ?? 0),
    0
  );

  // Best signal today
  const topSignal = flows
    .filter((f) => (f.signal_score ?? 0) > 0)
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))[0];

  const stats = [
    {
      label: "AUM (holdings sum)",
      value: fmtDollar.format(aum),
      sub: `as of ${holdingsDate}`,
    },
    {
      label: "Securities",
      value: totalHoldings.toLocaleString(),
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
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <p className="text-xs text-slate-500">{s.label}</p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums ${s.color ?? ""}`}
            >
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
          <span className="text-xs text-slate-400">{flowsDate}</span>
          {topSignal && (
            <span className="text-xs font-medium text-green-700">
              Top signal: {topSignal.ticker} (score{" "}
              {topSignal.signal_score?.toFixed(1)})
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
          <FlowChart history={flowHistory} />
        </div>
      </section>

      {/* All flow changes */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            All Rebalancing Flows
          </h2>
          <span className="text-xs text-slate-400">{flowsDate}</span>
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
