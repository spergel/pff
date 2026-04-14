import { loadPredictedFlows, loadTickerSummary } from "@/src/lib/data";
import { fmtDollar } from "@/src/lib/fmt";
import { PredictionChart } from "@/src/components/PredictionChart";
import type { PredictedFlow } from "@/src/types/pff";

const fmtPct = (v: number | null, decimals = 1) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;

// ─── slim side-by-side table ───────────────────────────────────────────────

function SideTable({
  title,
  rows,
  color,
}: {
  title: string;
  rows: PredictedFlow[];
  color: "red" | "green";
}) {
  if (rows.length === 0) return null;

  const isSell = color === "red";
  const headingCls = isSell ? "text-rose-500" : "text-emerald-600";
  const badgeCls = isSell ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700";
  const returnCls = isSell ? "text-rose-500" : "text-emerald-600";

  const sorted = [...rows].sort((a, b) =>
    isSell
      ? (b.predicted_dollar_flow ?? 0) - (a.predicted_dollar_flow ?? 0)
      : (a.predicted_dollar_flow ?? 0) - (b.predicted_dollar_flow ?? 0)
  );

  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${headingCls}`}>
          {title}
        </h2>
        <span className="font-mono text-[10px] text-gray-400">{rows.length} securities</span>
      </div>

      <div className="overflow-x-auto border-2 border-gray-600">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-500 bg-gray-300 text-[10px] text-gray-600">
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Ticker</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Return</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Wgt gap</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Est. $</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.map((r) => (
              <tr key={r.isin} className="hover:bg-yellow-50">
                <td className="px-3 py-1.5">
                  <div className="font-mono text-xs font-semibold text-gray-900">{r.ticker}</div>
                  <div className="max-w-[140px] truncate font-mono text-[9px] text-gray-400">{r.name}</div>
                </td>
                <td className={`px-3 py-1.5 text-right font-mono text-xs tabular-nums ${returnCls}`}>
                  {fmtPct(r.price_return_pct)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-gray-500">
                  {fmtPct(r.weight_gap_pct, 3)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <span className={`inline-block px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${badgeCls}`}>
                    {r.predicted_dollar_flow != null
                      ? fmtDollar(Math.abs(r.predicted_dollar_flow))
                      : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const rows = loadPredictedFlows();

  if (rows.length === 0) {
    return (
      <div className="border border-gray-500 px-6 py-12 text-center font-mono text-xs text-gray-400">
        no prediction data yet — runs daily after market close
      </div>
    );
  }

  const baselineDate = rows[0].baseline_date;
  const currentDate = rows[0].current_date;
  const sells = rows.filter((r) => r.predicted_action === "SELL");
  const buys = rows.filter((r) => r.predicted_action === "BUY");

  // Cross-reference: predicted sells also on an active sell streak
  const pffSummary = loadTickerSummary("PFF");
  const confirmedSellers = sells
    .map((r) => {
      const ts = pffSummary[`PFF:${r.isin}`];
      return {
        ...r,
        currentStreak: ts?.current_streak ?? 0,
        totalSellDays: ts?.sell_days ?? 0,
        totalNetFlow: ts?.net_dollar_flow ?? 0,
      };
    })
    .filter((r) => r.currentStreak < 0)
    .sort((a, b) => {
      const diff = a.currentStreak - b.currentStreak;
      return diff !== 0 ? diff : (b.predicted_dollar_flow ?? 0) - (a.predicted_dollar_flow ?? 0);
    });

  // Chart data
  const topSells = [...sells]
    .sort((a, b) => (b.predicted_dollar_flow ?? 0) - (a.predicted_dollar_flow ?? 0))
    .slice(0, 12)
    .map((r) => ({ ticker: r.ticker, name: r.name, value: -(r.predicted_dollar_flow ?? 0), action: "SELL" as const }));
  const topBuys = [...buys]
    .sort((a, b) => (a.predicted_dollar_flow ?? 0) - (b.predicted_dollar_flow ?? 0))
    .slice(0, 12)
    .map((r) => ({ ticker: r.ticker, name: r.name, value: -(r.predicted_dollar_flow ?? 0), action: "BUY" as const }));
  const chartRows = [...topSells.reverse(), ...topBuys];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-base font-bold text-gray-900">Predicted Rebalancing Flows</h1>
        <span className="font-mono text-xs text-gray-500">
          baseline <span className="text-gray-800">{baselineDate}</span>
          {" → "}
          <span className="text-gray-800">{currentDate}</span>
          {" · "}
          <span className="text-rose-500">{sells.length} predicted sells</span>
          {" · "}
          <span className="text-emerald-600">{buys.length} predicted buys</span>
        </span>
      </div>

      {/* How it works */}
      <div className="border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-[11px] text-gray-600 space-y-1.5">
        <div className="font-semibold text-gray-700 uppercase tracking-wider text-[10px]">How predictions work</div>
        <p>
          PFF tracks an index that rebalances quarterly (Mar / Jun / Sep / Dec). Between rebalances, each security&apos;s
          weight drifts as prices move. A security that <span className="text-rose-600">outperforms</span> the portfolio
          becomes overweight → PFF will <span className="text-rose-600">sell</span> it to restore the target weight.
          An <span className="text-emerald-700">underperformer</span> becomes underweight → PFF will{" "}
          <span className="text-emerald-700">buy</span> it.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[10px] border-t border-gray-200 pt-2">
          <div><span className="font-semibold text-gray-700">Return</span> — price change since the baseline date (the last rebalance)</div>
          <div><span className="font-semibold text-gray-700">Wgt gap</span> — implied weight minus baseline weight; positive = overweight, triggers a sell</div>
          <div><span className="font-semibold text-gray-700">Est. $</span> — estimated dollar flow PFF needs to trade to close the weight gap</div>
          <div><span className="font-semibold text-gray-700">Drift ratio</span> — implied weight ÷ baseline weight; how far the position has moved from target (hidden in slim view)</div>
        </div>
        <div className="border-t border-amber-200 bg-amber-50 -mx-4 px-4 py-2 mt-2 text-amber-700 text-[10px]">
          <span className="font-semibold">Ticker caveat:</span> our ticker resolution is imperfect — some preferred series show as plain equity tickers (e.g. &quot;C&quot; instead of &quot;C-J&quot;). Treat tickers as approximate identifiers; use ISIN/CUSIP for precision.
        </div>
      </div>

      {/* Chart — top */}
      <div className="border-2 border-gray-600 bg-white p-4">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Top predicted flows — sells (left) · buys (right) · sized by estimated $
        </p>
        <PredictionChart rows={chartRows} />
        <div className="mt-2 flex gap-4 font-mono text-[10px] text-gray-400">
          <span><span className="inline-block w-2 h-2 bg-rose-500 mr-1" />predicted sell</span>
          <span><span className="inline-block w-2 h-2 bg-emerald-600 mr-1" />predicted buy</span>
        </div>
      </div>

      {/* Confirmed sellers */}
      {confirmedSellers.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-500">
            Active Sell Pressure
            <span className="ml-2 font-normal text-gray-400 normal-case">
              — model predicts sell AND security is currently on a live sell streak in flow data
            </span>
          </h2>
          <div className="overflow-x-auto border-2 border-gray-600">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-500 bg-gray-300 text-[10px] text-gray-500">
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Ticker</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Sector</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Streak</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Sell days</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Net flow</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Return</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Wgt gap</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Est. $</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {confirmedSellers.map((r) => (
                  <tr key={r.isin} className="bg-rose-50 hover:bg-rose-100">
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-semibold text-gray-900">{r.ticker}</div>
                      <div className="max-w-[160px] truncate font-mono text-[9px] text-gray-400">{r.name}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.sector}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-rose-600">{r.currentStreak}d</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{r.totalSellDays}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-rose-500">{fmtDollar(r.totalNetFlow)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-rose-500">{fmtPct(r.price_return_pct)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{fmtPct(r.weight_gap_pct, 3)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-block bg-rose-100 px-2 py-0.5 font-mono text-xs font-medium text-rose-700">
                        {r.predicted_dollar_flow != null ? fmtDollar(Math.abs(r.predicted_dollar_flow)) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Side-by-side sells + buys */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SideTable title="Predicted Sells" rows={sells} color="red" />
        <SideTable title="Predicted Buys" rows={buys} color="green" />
      </div>
    </div>
  );
}
