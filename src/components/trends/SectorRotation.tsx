import type { DayAggregate } from "@/src/types/pff";

const fmtM = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function SectorRotation({ days }: { days: DayAggregate[] }) {
  // Aggregate net dollar flow by sector across all days in window
  const sectorNet: Record<string, number> = {};
  for (const day of days) {
    for (const [sector, net] of Object.entries(day.sector_net ?? {})) {
      sectorNet[sector] = (sectorNet[sector] ?? 0) + net;
    }
  }

  const rows = Object.entries(sectorNet)
    .filter(([, v]) => v !== 0)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

  if (!rows.length) {
    return <p className="text-sm text-slate-400">No sector data available.</p>;
  }

  const maxAbs = Math.max(...rows.map(([, v]) => Math.abs(v)), 1);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Sector</th>
            <th className="px-3 py-2">Net Flow</th>
            <th className="px-3 py-2 w-48">Bar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(([sector, net]) => {
            const pct = Math.round((Math.abs(net) / maxAbs) * 100);
            const isPositive = net >= 0;
            return (
              <tr key={sector} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700">{sector}</td>
                <td
                  className={`px-3 py-2 font-mono font-medium ${
                    isPositive ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {fmtM.format(net)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center">
                    {isPositive ? (
                      <div className="ml-[50%] h-3 rounded-r bg-green-400" style={{ width: `${pct / 2}%` }} />
                    ) : (
                      <div
                        className="h-3 rounded-l bg-red-400"
                        style={{ width: `${pct / 2}%`, marginLeft: `${50 - pct / 2}%` }}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
