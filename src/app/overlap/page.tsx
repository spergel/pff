import { loadOverlapSummary, listFlowDates, computeConsensus, SUPPORTED_ETFS } from "@/src/lib/data";
import { DateNav } from "@/src/components/DateNav";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const ETF_BADGE: Record<string, string> = {
  PFF: "bg-blue-100 text-blue-800",
  PGX: "bg-purple-100 text-purple-700",
  FPE: "bg-amber-100 text-amber-700",
  PFFA: "bg-green-100 text-green-700",
};

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span className="text-gray-300">—</span>;
  const buying = streak > 0;
  return (
    <span className={`font-mono text-xs font-semibold ${buying ? "text-emerald-600" : "text-rose-500"}`}>
      {buying ? "+" : ""}
      {streak}d
    </span>
  );
}

export default function OverlapPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const overlap = loadOverlapSummary();
  const allDates = listFlowDates("PFF").length > 0
    ? listFlowDates("PFF")
    : listFlowDates("PGX");

  const selectedDate = searchParams.date ?? allDates[0] ?? "";
  const dateIdx = allDates.indexOf(selectedDate);
  const prevDate = dateIdx >= 0 && dateIdx < allDates.length - 1 ? allDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? allDates[dateIdx - 1] : null;

  const consensus = selectedDate ? computeConsensus(selectedDate, overlap) : [];

  const entries = Object.values(overlap.by_cusip)
    .filter((e) => e.num_etfs >= 2)
    .sort(
      (a, b) =>
        b.num_etfs - a.num_etfs || Math.abs(b.combined_net_flow) - Math.abs(a.combined_net_flow)
    );

  const allEtfs = SUPPORTED_ETFS.filter((etf) => listFlowDates(etf).length > 0);

  const consensusBuys = consensus.filter((r) => r.consensus === "BUY").length;
  const consensusSells = consensus.filter((r) => r.consensus === "SELL").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Cross-ETF Holdings Overlap</h1>
          <p className="mt-0.5 font-mono text-xs text-gray-500">
            {entries.length} securities held by 2+ preferred ETFs
          </p>
        </div>
      </div>

      {/* Consensus section */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Consensus Signals
          </h2>
          {selectedDate && allDates.length > 0 && (
            <DateNav
              selectedDate={selectedDate}
              prevDate={prevDate}
              nextDate={nextDate}
              etf="PFF"
              allDates={allDates}
              basePath="/overlap"
            />
          )}
          {consensus.length > 0 && (
            <span className="font-mono text-[10px] text-gray-500">
              <span className="text-emerald-600">{consensusBuys} buy{consensusBuys !== 1 ? "s" : ""}</span>
              {" · "}
              <span className="text-rose-500">{consensusSells} sell{consensusSells !== 1 ? "s" : ""}</span>
              {" · "}⚡ = all ETFs agree
            </span>
          )}
        </div>

        {consensus.length === 0 ? (
          <div className="border border-gray-500 px-6 py-10 text-center font-mono text-xs text-gray-400">
            no cross-ETF consensus signals for {selectedDate || "this date"}
          </div>
        ) : (
          <div className="overflow-x-auto border-2 border-gray-600">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
                  <th className="px-4 py-2">Dir</th>
                  <th className="px-4 py-2">Ticker</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">ETFs</th>
                  <th className="px-4 py-2">Combined $</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {consensus.map((row) => (
                  <tr
                    key={row.cusip}
                    className={` ${
                      row.consensus === "BUY"
                        ? "bg-emerald-50 hover:bg-emerald-100"
                        : "bg-rose-50 hover:bg-rose-100"
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={` px-2 py-0.5 font-mono text-xs font-bold ${
                          row.consensus === "BUY"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {row.etf_count === 3 ? "⚡ " : ""}
                        {row.consensus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">
                      {row.ticker || "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-gray-600">{row.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {row.etfs.map((etf) => (
                          <span
                            key={etf}
                            className={` px-1.5 py-0.5 font-mono text-xs font-semibold ${ETF_BADGE[etf] ?? "bg-gray-100 text-gray-500"}`}
                          >
                            {etf}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td
                      className={`px-4 py-2.5 font-mono font-medium ${
                        row.consensus === "BUY" ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {fmtDollar.format(row.combined_flow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Full overlap table */}
      <section>
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          All Overlapping Holdings
        </h2>
        <div className="overflow-x-auto border-2 border-gray-600">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Sector</th>
                {allEtfs.map((etf) => (
                  <th key={etf} className="px-4 py-2">
                    {etf} streak
                  </th>
                ))}
                {allEtfs.map((etf) => (
                  <th key={etf + "_flow"} className="px-4 py-2">
                    {etf} net $
                  </th>
                ))}
                <th className="px-4 py-2">Combined $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {entries.map((entry) => {
                const sector = Object.values(entry.etfs).find((e) => e.sector)?.sector ?? "";
                return (
                  <tr key={entry.cusip} className="hover:bg-yellow-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {Object.keys(entry.etfs).map((etf) => (
                            <span
                              key={etf}
                              className={` px-1 py-0.5 font-mono text-xs font-semibold ${ETF_BADGE[etf] ?? "bg-gray-100 text-gray-500"}`}
                            >
                              {etf}
                            </span>
                          ))}
                        </div>
                        <div>
                          <span className="font-mono font-semibold text-gray-900">
                            {Object.values(entry.etfs).find((e) => e.ticker)?.ticker ?? "—"}
                          </span>
                          <span className="ml-2 max-w-xs truncate font-mono text-xs text-gray-500">
                            {entry.name}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{sector}</td>
                    {allEtfs.map((etf) => {
                      const d = entry.etfs[etf];
                      return (
                        <td key={etf} className="px-4 py-2.5">
                          {d ? (
                            <StreakBadge streak={d.current_streak} />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    {allEtfs.map((etf) => {
                      const d = entry.etfs[etf];
                      return (
                        <td
                          key={etf + "_flow"}
                          className={`px-4 py-2.5 font-mono text-xs ${
                            d && d.net_dollar_flow > 0 ? "text-emerald-600" : "text-rose-500"
                          }`}
                        >
                          {d ? fmtDollar.format(d.net_dollar_flow) : "—"}
                        </td>
                      );
                    })}
                    <td
                      className={`px-4 py-2.5 font-mono text-xs font-medium ${
                        entry.combined_net_flow > 0 ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {fmtDollar.format(entry.combined_net_flow)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
