import { loadOverlapSummary, listFlowDates, computeConsensus, SUPPORTED_ETFS } from "@/src/lib/data";

const fmtDollar = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const ETF_COLORS: Record<string, string> = {
  PFF: "bg-blue-100 text-blue-700",
  PGX: "bg-purple-100 text-purple-700",
  FPE: "bg-amber-100 text-amber-700",
};

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span className="text-slate-300">—</span>;
  const buying = streak > 0;
  return (
    <span className={`font-mono text-xs font-semibold ${buying ? "text-green-700" : "text-red-700"}`}>
      {buying ? "+" : ""}{streak}d
    </span>
  );
}

export default function OverlapPage() {
  const overlap = loadOverlapSummary();
  const latestDate = listFlowDates("PFF")[0] ?? listFlowDates("PGX")[0] ?? "";
  const consensus = latestDate ? computeConsensus(latestDate, overlap) : [];

  const entries = Object.values(overlap.by_cusip)
    .filter((e) => e.num_etfs >= 2)
    .sort((a, b) => b.num_etfs - a.num_etfs || Math.abs(b.combined_net_flow) - Math.abs(a.combined_net_flow));

  const allEtfs = SUPPORTED_ETFS.filter((etf) => listFlowDates(etf).length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Cross-ETF Holdings Overlap</h1>
        <p className="mt-1 text-sm text-slate-500">
          {entries.length} securities held by 2+ preferred ETFs simultaneously · {consensus.length} consensus signals today
        </p>
      </div>

      {/* Consensus signals for today */}
      {consensus.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Today's Consensus · {latestDate}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Dir</th>
                  <th className="px-4 py-2">Ticker</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">ETFs</th>
                  <th className="px-4 py-2">Combined $</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {consensus.map((row) => (
                  <tr key={row.cusip} className={row.consensus === "BUY" ? "bg-green-50" : "bg-red-50"}>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${row.consensus === "BUY" ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                        {row.etf_count === 3 ? "⚡ " : ""}{row.consensus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{row.ticker || "—"}</td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-slate-600">{row.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {row.etfs.map((etf) => (
                          <span key={etf} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${ETF_COLORS[etf] ?? ""}`}>{etf}</span>
                        ))}
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 font-mono font-medium ${row.consensus === "BUY" ? "text-green-700" : "text-red-700"}`}>
                      {fmtDollar.format(row.combined_flow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Full overlap table */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          All Overlapping Holdings
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Sector</th>
                {allEtfs.map((etf) => (
                  <th key={etf} className="px-4 py-2">{etf} streak</th>
                ))}
                {allEtfs.map((etf) => (
                  <th key={etf + "_flow"} className="px-4 py-2">{etf} net $</th>
                ))}
                <th className="px-4 py-2">Combined $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => {
                const firstEtf = Object.values(entry.etfs)[0];
                const sector = Object.values(entry.etfs).find((e) => e.sector)?.sector ?? "";
                return (
                  <tr key={entry.cusip} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {Object.keys(entry.etfs).map((etf) => (
                            <span key={etf} className={`rounded px-1 py-0.5 text-xs font-semibold ${ETF_COLORS[etf] ?? ""}`}>{etf}</span>
                          ))}
                        </div>
                        <div>
                          <span className="font-mono font-semibold text-slate-800">
                            {Object.values(entry.etfs).find((e) => e.ticker)?.ticker ?? "—"}
                          </span>
                          <span className="ml-2 text-xs text-slate-500 truncate max-w-xs">{entry.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{sector}</td>
                    {allEtfs.map((etf) => {
                      const d = entry.etfs[etf];
                      return (
                        <td key={etf} className="px-4 py-2.5">
                          {d ? <StreakBadge streak={d.current_streak} /> : <span className="text-slate-200">—</span>}
                        </td>
                      );
                    })}
                    {allEtfs.map((etf) => {
                      const d = entry.etfs[etf];
                      return (
                        <td key={etf + "_flow"} className={`px-4 py-2.5 font-mono text-xs ${d && d.net_dollar_flow > 0 ? "text-green-700" : "text-red-700"}`}>
                          {d ? fmtDollar.format(d.net_dollar_flow) : "—"}
                        </td>
                      );
                    })}
                    <td className={`px-4 py-2.5 font-mono text-xs font-medium ${entry.combined_net_flow > 0 ? "text-green-700" : "text-red-700"}`}>
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
