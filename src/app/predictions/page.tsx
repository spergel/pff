import { loadPredictedFlows, loadTickerSummary } from "@/src/lib/data";
import { fmtDollar } from "@/src/lib/fmt";
import { PredictionChart } from "@/src/components/PredictionChart";

const fmtPct = (v: number | null, decimals = 2) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;

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

  // Cross-reference: predicted PFF sells that also have an active sell streak in flow data
  const pffSummary = loadTickerSummary("PFF"); // keyed "PFF:{ISIN}"
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
      // Primary: streak magnitude; secondary: predicted flow
      const diff = a.currentStreak - b.currentStreak;
      return diff !== 0 ? diff : (b.predicted_dollar_flow ?? 0) - (a.predicted_dollar_flow ?? 0);
    });

  // Chart data: top 12 sells + top 12 buys by magnitude, sorted sell→buy
  const topSells = [...sells]
    .sort((a, b) => (b.predicted_dollar_flow ?? 0) - (a.predicted_dollar_flow ?? 0))
    .slice(0, 12)
    .map((r) => ({
      ticker: r.ticker,
      name: r.name,
      value: -(r.predicted_dollar_flow ?? 0),
      action: "SELL" as const,
    }));
  const topBuys = [...buys]
    .sort((a, b) => (a.predicted_dollar_flow ?? 0) - (b.predicted_dollar_flow ?? 0))
    .slice(0, 12)
    .map((r) => ({
      ticker: r.ticker,
      name: r.name,
      value: -(r.predicted_dollar_flow ?? 0),
      action: "BUY" as const,
    }));
  const chartRows = [...topSells.reverse(), ...topBuys];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-base font-bold text-gray-900">Predicted Rebalancing Flows</h1>
        <span className="font-mono text-xs text-gray-500">
          drift since <span className="text-gray-800">{baselineDate}</span>
          {" · "}as of <span className="text-gray-800">{currentDate}</span>
          {" · "}
          <span className="text-rose-500">{sells.length} sells</span>
          {" · "}
          <span className="text-emerald-600">{buys.length} buys</span>
        </span>
      </div>

      <p className="font-mono text-xs text-gray-500 -mt-2">
        securities that outperformed the portfolio since last rebalancing are overweight — PFF will
        sell them at month-end · underperformers will be bought
      </p>

      {/* Confirmed sellers — model + flow data both agree */}
      {confirmedSellers.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-500">
            Active Sell Pressure
            <span className="ml-2 font-normal text-gray-400 normal-case">
              — predicted sell AND currently on a sell streak
            </span>
          </h2>
          <div className="overflow-x-auto border-2 border-gray-600">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-500 bg-gray-300 text-[10px] text-gray-500">
                  <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider">Ticker</th>
                  <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider">Name</th>
                  <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider">Sector</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Streak</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Sell days</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Net flow (all-time)</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Return</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Wgt gap</th>
                  <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Pred. flow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {confirmedSellers.map((r) => (
                  <tr key={r.isin} className="bg-rose-50 hover:bg-rose-100">
                    <td className="px-4 py-2 font-mono font-semibold text-gray-900">{r.ticker}</td>
                    <td className="max-w-[180px] truncate px-4 py-2 text-gray-600">{r.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.sector}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-rose-600">
                      {r.currentStreak}d
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                      {r.totalSellDays}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-rose-500">
                      {fmtDollar(r.totalNetFlow)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-rose-500">
                      {fmtPct(r.price_return_pct)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                      {fmtPct(r.weight_gap_pct, 3)}
                    </td>
                    <td className="px-4 py-2 text-right">
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

      {/* Chart */}
      <div className="border-2 border-gray-600 bg-white p-4">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Top predicted flows — top 12 sells · top 12 buys
        </p>
        <PredictionChart rows={chartRows} />
        <div className="mt-2 flex gap-4 font-mono text-[10px] text-gray-400">
          <span><span className="inline-block w-2 h-2 bg-rose-500 mr-1" />sell (bars left)</span>
          <span><span className="inline-block w-2 h-2 bg-emerald-600 mr-1" />buy (bars right)</span>
        </div>
      </div>

      <FlowTable title="Predicted Sells" rows={sells} color="red" />
      <FlowTable title="Predicted Buys" rows={buys} color="green" />
    </div>
  );
}

function FlowTable({
  title,
  rows,
  color,
}: {
  title: string;
  rows: ReturnType<typeof loadPredictedFlows>;
  color: "red" | "green";
}) {
  if (rows.length === 0) return null;

  const accent = color === "red" ? "text-rose-500" : "text-emerald-600";
  const badge =
    color === "red"
      ? "bg-rose-100 text-rose-700"
      : "bg-emerald-100 text-emerald-700";
  const heading = color === "red" ? "text-rose-500" : "text-emerald-600";

  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${heading}`}>
          {title}
        </h2>
        <span className="font-mono text-xs text-gray-500">{rows.length} securities</span>
      </div>

      <div className="overflow-x-auto border-2 border-gray-600">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-600 bg-gray-300 text-[10px] text-gray-500">
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider">Ticker</th>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider">Name</th>
              <th className="px-4 py-2 text-left font-semibold uppercase tracking-wider">Sector</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Return</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Drift</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Wgt gap</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Pred. flow</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {rows.map((r) => (
              <tr key={r.isin} className="hover:bg-yellow-50">
                <td className="px-4 py-2 font-mono font-medium text-gray-900">{r.ticker}</td>
                <td className="max-w-[200px] truncate px-4 py-2 text-gray-600">{r.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.sector}</td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums font-medium ${accent}`}>
                  {fmtPct(r.price_return_pct)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-500">
                  {r.drift_ratio != null ? r.drift_ratio.toFixed(4) : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-500">
                  {fmtPct(r.weight_gap_pct, 3)}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={`inline-block px-2 py-0.5 font-mono text-xs font-medium tabular-nums ${badge}`}>
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
