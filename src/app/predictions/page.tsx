import { loadPredictedFlows } from "@/src/lib/data";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-base font-bold text-gray-900">Predicted Rebalancing Flows</h1>
        <span className="font-mono text-xs text-gray-500">
          drift since <span className="text-gray-800">{baselineDate}</span>
          {" · "}as of <span className="text-gray-800">{currentDate}</span>
        </span>
      </div>

      <p className="font-mono text-xs text-gray-500 -mt-2">
        securities that outperformed the portfolio since last rebalancing are overweight — PFF will
        sell them at month-end · underperformers will be bought
      </p>

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
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Baseline $</th>
              <th className="px-4 py-2 text-right font-semibold uppercase tracking-wider">Current $</th>
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
                <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-600">
                  {r.baseline_price != null ? `$${r.baseline_price.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-600">
                  {r.current_price != null ? `$${r.current_price.toFixed(2)}` : "—"}
                </td>
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
                  <span className={`inline-block  px-2 py-0.5 font-mono text-xs font-medium tabular-nums ${badge}`}>
                    {r.predicted_dollar_flow != null
                      ? fmt.format(Math.abs(r.predicted_dollar_flow))
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
