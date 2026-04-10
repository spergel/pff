import type { DayAggregate } from "@/src/types/pff";

const fmtM = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function SectorRotation({ days }: { days: DayAggregate[] }) {
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
    return (
      <p className="font-mono text-xs text-gray-400">no sector data available</p>
    );
  }

  const maxAbs = Math.max(...rows.map(([, v]) => Math.abs(v)), 1);

  return (
    <div className="overflow-x-auto border-2 border-gray-600">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
            <th className="px-3 py-2">Sector</th>
            <th className="px-3 py-2">Net Flow</th>
            <th className="w-48 px-3 py-2">Bar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map(([sector, net]) => {
            const pct = Math.round((Math.abs(net) / maxAbs) * 100);
            const isPositive = net >= 0;
            return (
              <tr key={sector} className="hover:bg-yellow-50">
                <td className="px-3 py-2 text-gray-700">{sector}</td>
                <td
                  className={`px-3 py-2 font-mono font-medium ${
                    isPositive ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {fmtM.format(net)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center">
                    {isPositive ? (
                      <div
                        className="ml-[50%] h-2.5 bg-emerald-500/60"
                        style={{ width: `${pct / 2}%` }}
                      />
                    ) : (
                      <div
                        className="h-2.5 bg-rose-500/60"
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
