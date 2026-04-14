"use client";

import { fmtDollar } from "@/src/lib/fmt";

export type MosaicTile = {
  ticker: string;
  desc: string | null;
  name: string;
  net: number;       // net dollar flow over the period (positive = net buy)
  buys: number;      // total buy dollars
  sells: number;     // total sell dollars
  days: number;      // number of active days
  etfs: string[];
};

const ETF_BADGE: Record<string, string> = {
  PFF:  "bg-blue-100 text-blue-800",
  PGX:  "bg-purple-100 text-purple-700",
  FPE:  "bg-amber-100 text-amber-700",
  PFFA: "bg-green-100 text-green-700",
  PFFD: "bg-teal-100 text-teal-700",
  PFXF: "bg-rose-100 text-rose-700",
};

function Tile({ tile, maxAbs }: { tile: MosaicTile; maxAbs: number }) {
  const isBuy = tile.net >= 0;
  const pct = maxAbs > 0 ? Math.abs(tile.net) / maxAbs : 0;

  // Width: proportional to sqrt of pct (compresses extremes, keeps tiny tiles visible)
  const widthPct = Math.max(4, Math.round(Math.sqrt(pct) * 30));

  return (
    <div
      title={`${tile.ticker} · net ${fmtDollar(tile.net)} · ${tile.days}d active\n${tile.name}`}
      style={{ flexBasis: `${widthPct}%`, flexGrow: widthPct, minWidth: "72px", maxWidth: "260px" }}
      className={`relative overflow-hidden border p-2 ${
        isBuy
          ? "border-emerald-200 bg-emerald-50"
          : "border-rose-200 bg-rose-50"
      }`}
    >
      {/* Magnitude fill bar along the bottom */}
      <div
        className={`absolute bottom-0 left-0 h-0.5 ${isBuy ? "bg-emerald-400" : "bg-rose-400"}`}
        style={{ width: `${Math.round(pct * 100)}%` }}
      />

      <div className={`font-mono text-xs font-bold leading-tight ${isBuy ? "text-emerald-800" : "text-rose-800"}`}>
        {tile.ticker}
      </div>

      {tile.desc && (
        <div className="truncate font-mono text-[9px] leading-tight text-gray-400 mt-0.5">
          {tile.desc}
        </div>
      )}

      <div className={`mt-1 font-mono text-[10px] font-semibold ${isBuy ? "text-emerald-600" : "text-rose-500"}`}>
        {isBuy ? "+" : ""}{fmtDollar(tile.net)}
      </div>

      <div className="mt-0.5 flex flex-wrap gap-0.5">
        {tile.etfs.map((e) => (
          <span key={e} className={`px-1 text-[8px] font-semibold leading-tight ${ETF_BADGE[e] ?? "bg-gray-100 text-gray-500"}`}>
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FlowMosaic({
  tiles,
  period,
}: {
  tiles: MosaicTile[];
  period: "week" | "month";
}) {
  if (!tiles.length) {
    return (
      <div className="flex h-32 items-center justify-center font-mono text-xs text-gray-400">
        no flow data for this period
      </div>
    );
  }

  const buys = tiles.filter((t) => t.net > 0).sort((a, b) => b.net - a.net);
  const sells = tiles.filter((t) => t.net < 0).sort((a, b) => a.net - b.net);
  const maxAbs = Math.max(...tiles.map((t) => Math.abs(t.net)));

  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] text-gray-400">
        {period === "week" ? "last 5 trading days" : "last 21 trading days"} ·{" "}
        {buys.length} net-bought · {sells.length} net-sold · sized by dollar flow
      </div>

      {buys.length > 0 && (
        <div>
          <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
            Net Bought
          </div>
          <div className="flex flex-wrap gap-1.5">
            {buys.map((t) => <Tile key={`${t.ticker}-${t.etfs.join("")}`} tile={t} maxAbs={maxAbs} />)}
          </div>
        </div>
      )}

      {sells.length > 0 && (
        <div>
          <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-500">
            Net Sold
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sells.map((t) => <Tile key={`${t.ticker}-${t.etfs.join("")}`} tile={t} maxAbs={maxAbs} />)}
          </div>
        </div>
      )}
    </div>
  );
}
