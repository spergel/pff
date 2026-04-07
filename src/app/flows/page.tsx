import { listFlowDates, loadFlows } from "@/src/lib/data";
import { FlowsTable } from "@/src/components/FlowsTable";
import { FlowDateSelect } from "@/src/components/FlowDateSelect";

export default function FlowsPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const dates = listFlowDates();
  const selectedDate = searchParams.date ?? dates[0];
  const flows = selectedDate ? loadFlows(selectedDate) : [];

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

        {dates.length > 0 && (
          <FlowDateSelect dates={dates} selectedDate={selectedDate} />
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
