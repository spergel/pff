import { listFlowDates, loadFlows, SUPPORTED_ETFS } from "@/src/lib/data";
import { FlowsTable } from "@/src/components/FlowsTable";
import { DateNav } from "@/src/components/DateNav";
import type { EtfTicker } from "@/src/lib/data";

export default function FlowsPage({
  searchParams,
}: {
  searchParams: { date?: string; etf?: string };
}) {
  const etf = (SUPPORTED_ETFS.includes(searchParams.etf as EtfTicker)
    ? searchParams.etf
    : "PFF") as EtfTicker;

  // dates is newest-first
  const dates = listFlowDates(etf);
  const selectedDate = searchParams.date ?? dates[0];
  const flows = selectedDate ? loadFlows(selectedDate, etf) : [];

  const dateIdx = selectedDate ? dates.indexOf(selectedDate) : -1;
  const prevDate = dateIdx >= 0 && dateIdx < dates.length - 1 ? dates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? dates[dateIdx - 1] : null;

  const changes = flows.filter((f) => f.flow_type !== "UNCHANGED");
  const buyDollars = changes
    .filter((f) => f.flow_type === "BUY" || f.flow_type === "ADDED")
    .reduce((s, f) => s + (f.dollar_flow ?? 0), 0);
  const sellDollars = changes
    .filter((f) => f.flow_type === "SELL" || f.flow_type === "REMOVED")
    .reduce((s, f) => s + Math.abs(f.dollar_flow ?? 0), 0);

  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold">Flow History</h1>

        {/* ETF selector */}
        <div className="flex gap-1">
          {SUPPORTED_ETFS.map((e) => (
            <a
              key={e}
              href={`/flows?etf=${e}`}
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

        {selectedDate && (
          <DateNav
            selectedDate={selectedDate}
            prevDate={prevDate}
            nextDate={nextDate}
            etf={etf}
            allDates={dates}
          />
        )}

        {changes.length > 0 && (
          <span className="text-sm text-slate-500">
            <span className="text-green-700">{fmt.format(buyDollars)} bought</span>
            {" · "}
            <span className="text-red-700">{fmt.format(sellDollars)} sold</span>
          </span>
        )}
      </div>

      {flows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-slate-400">
          No flow data for this date.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <FlowsTable flows={flows} showAll />
        </div>
      )}
    </div>
  );
}
