import { loadLatestHoldings } from "@/src/lib/data";
import { HoldingsTable } from "@/src/components/HoldingsTable";

export default function HoldingsPage() {
  const result = loadLatestHoldings();

  if (!result) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-slate-400">
        No holdings data yet. Run the scraper to populate.
      </div>
    );
  }

  const { date, holdings } = result;
  const aum = holdings.reduce((s, h) => s + (h.mkt_val ?? 0), 0);
  const resolved = holdings.filter((h) => h.ticker !== h.ticker_raw).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-bold">Holdings</h1>
        <span className="text-sm text-slate-500">as of {date}</span>
        <span className="text-sm text-slate-500">
          {holdings.length} securities ·{" "}
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(aum)}{" "}
          AUM
        </span>
        {resolved > 0 && (
          <span className="text-sm text-blue-600">
            {resolved} tickers resolved via OpenFIGI
          </span>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <HoldingsTable holdings={holdings} />
      </div>
    </div>
  );
}
