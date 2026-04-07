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
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-slate-400">
        No prediction data yet — runs daily after market close.
      </div>
    );
  }

  const baselineDate = rows[0].baseline_date;
  const currentDate = rows[0].current_date;
  const sells = rows.filter((r) => r.predicted_action === "SELL");
  const buys = rows.filter((r) => r.predicted_action === "BUY");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-bold">Predicted Rebalancing Flows</h1>
        <span className="text-sm text-slate-500">
          Drift since <span className="font-medium">{baselineDate}</span>
          {" · "}as of <span className="font-medium">{currentDate}</span>
        </span>
      </div>

      <p className="text-sm text-slate-500 -mt-4">
        Securities that outperformed the portfolio since the last rebalancing are
        overweight — PFF will sell them at month-end. Underperformers will be bought.
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

  const accent = color === "red" ? "text-red-700" : "text-green-700";
  const badge =
    color === "red"
      ? "bg-red-50 text-red-700 ring-1 ring-red-200"
      : "bg-green-50 text-green-700 ring-1 ring-green-200";

  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        <span className="text-xs text-slate-400">{rows.length} securities</span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="px-4 py-2 text-left font-medium">Ticker</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Sector</th>
              <th className="px-4 py-2 text-right font-medium">Baseline $</th>
              <th className="px-4 py-2 text-right font-medium">Current $</th>
              <th className="px-4 py-2 text-right font-medium">Return</th>
              <th className="px-4 py-2 text-right font-medium">Drift</th>
              <th className="px-4 py-2 text-right font-medium">Wgt gap</th>
              <th className="px-4 py-2 text-right font-medium">Pred. flow</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.isin} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono font-medium">{r.ticker}</td>
                <td className="px-4 py-2 text-slate-600 max-w-[200px] truncate">{r.name}</td>
                <td className="px-4 py-2 text-slate-500 text-xs">{r.sector}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.baseline_price != null ? `$${r.baseline_price.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.current_price != null ? `$${r.current_price.toFixed(2)}` : "—"}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-medium ${accent}`}>
                  {fmtPct(r.price_return_pct)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {r.drift_ratio != null ? r.drift_ratio.toFixed(4) : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {fmtPct(r.weight_gap_pct, 3)}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium tabular-nums ${badge}`}>
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
