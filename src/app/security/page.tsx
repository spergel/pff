import { SUPPORTED_ETFS, loadTickerSummary, listFlowDates, loadLatestHoldings } from "@/src/lib/data";
import type { EtfTicker } from "@/src/lib/data";
import type { TickerAggregate } from "@/src/types/pff";
import Link from "next/link";
import { fmtDollar, fmtNum } from "@/src/lib/fmt";


// ─── holdings enrichment (CUSIP / country / exchange) ──────────────────────

interface Enrichment {
  cusip: string;
  country: string;
  exchange: string;
}

function buildEnrichmentMap(): Map<string, Enrichment> {
  const map = new Map<string, Enrichment>();
  for (const etf of SUPPORTED_ETFS) {
    const result = loadLatestHoldings(etf);
    if (!result) continue;
    for (const h of result.holdings) {
      if (!map.has(h.isin) && h.isin) {
        map.set(h.isin, {
          cusip: h.cusip ?? "",
          country: h.country ?? "",
          exchange: h.exchange ?? "",
        });
      }
    }
  }
  return map;
}

// ─── calendar helpers ──────────────────────────────────────────────────────

function buildCalendarMarkers(allDates: string[]): Map<string, "Q" | "M"> {
  const sorted = [...allDates].sort();
  const markers = new Map<string, "Q" | "M">();
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const next = sorted[i + 1];
    if (next && next.slice(0, 7) === d.slice(0, 7)) continue;
    const month = parseInt(d.slice(5, 7));
    markers.set(d, [3, 6, 9, 12].includes(month) ? "Q" : "M");
  }
  return markers;
}

// ─── search ────────────────────────────────────────────────────────────────

interface Match {
  etf: EtfTicker;
  key: string;
  agg: TickerAggregate;
  enrich: Enrichment | null;
}

function searchSecurities(q: string, enrichMap: Map<string, Enrichment>): Match[] {
  if (!q.trim()) return [];
  const lower = q.toLowerCase().trim();
  const seen = new Set<string>(); // deduplicate by isin+etf
  const results: Match[] = [];

  for (const etf of SUPPORTED_ETFS) {
    const summary = loadTickerSummary(etf);
    for (const [key, agg] of Object.entries(summary)) {
      const enrich = enrichMap.get(agg.isin) ?? null;

      const ticker = (agg.ticker ?? "").toLowerCase();
      const name = (agg.name ?? "").toLowerCase();
      const isin = (agg.isin ?? "").toLowerCase();
      const sector = (agg.sector ?? "").toLowerCase();
      const cusip = (enrich?.cusip ?? "").toLowerCase();
      const country = (enrich?.country ?? "").toLowerCase();
      const exchange = (enrich?.exchange ?? "").toLowerCase();

      const matches =
        ticker.includes(lower) ||
        name.includes(lower) ||
        isin === lower ||
        (cusip && cusip === lower) ||
        sector.includes(lower) ||
        (country && country.includes(lower)) ||
        (exchange && exchange.includes(lower));

      if (matches) {
        const dedupeKey = `${etf}:${agg.isin}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          results.push({ etf, key, agg, enrich });
        }
      }
    }
  }

  return results.sort((a, b) => {
    // Exact ticker match first
    const aExact = (a.agg.ticker ?? "").toLowerCase() === lower ? 0 : 1;
    const bExact = (b.agg.ticker ?? "").toLowerCase() === lower ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    // Then by net flow magnitude (most active first)
    return Math.abs(b.agg.net_dollar_flow) - Math.abs(a.agg.net_dollar_flow);
  });
}

// ─── display helpers ───────────────────────────────────────────────────────

const FLOW_COLOR: Record<string, string> = {
  BUY: "text-emerald-600",
  ADDED: "text-blue-700",
  SELL: "text-rose-500",
  REMOVED: "text-orange-600",
  SUSPECT: "text-yellow-600",
  UNCHANGED: "text-gray-400",
};

const ETF_BADGE: Record<string, string> = {
  PFF: "bg-blue-100 text-blue-800",
  PGX: "bg-purple-100 text-purple-700",
  FPE: "bg-amber-100 text-amber-700",
  PFFA: "bg-green-100 text-green-700",
};

const SECTOR_SHORT: Record<string, string> = {
  "Financial Institutions": "Financials",
  "Cash and/or Derivatives": "Cash/Deriv",
  "Utility": "Utilities",
};

function abbrevSector(s: string) {
  return SECTOR_SHORT[s] ?? s;
}

function CalMarker({ mark }: { mark: "Q" | "M" | undefined }) {
  if (!mark) return null;
  if (mark === "Q")
    return (
      <span className="ml-1 bg-blue-100 px-1 py-0.5 font-mono text-[9px] font-bold text-blue-800">
        Q-END
      </span>
    );
  return (
    <span className="ml-1 bg-gray-100 px-1 py-0.5 font-mono text-[9px] text-gray-500">
      M-END
    </span>
  );
}

// ─── history table ─────────────────────────────────────────────────────────

function SecurityHistory({
  etf,
  agg,
  calMarkers,
}: {
  etf: EtfTicker;
  agg: TickerAggregate;
  calMarkers: Map<string, "Q" | "M">;
}) {
  const events = [...agg.history]
    .filter((h) => h.flow_type !== "UNCHANGED")
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!events.length) {
    return (
      <p className="py-4 text-center font-mono text-xs text-gray-400">
        no flow events recorded
      </p>
    );
  }

  const monthEndSells = events
    .filter((e) => calMarkers.has(e.date) && (e.flow_type === "SELL" || e.flow_type === "REMOVED"))
    .reduce((s, e) => s + Math.abs(e.dollar_flow), 0);
  const monthEndBuys = events
    .filter((e) => calMarkers.has(e.date) && (e.flow_type === "BUY" || e.flow_type === "ADDED"))
    .reduce((s, e) => s + e.dollar_flow, 0);
  const quarterEndSells = events
    .filter((e) => calMarkers.get(e.date) === "Q" && (e.flow_type === "SELL" || e.flow_type === "REMOVED"))
    .reduce((s, e) => s + Math.abs(e.dollar_flow), 0);

  return (
    <div className="space-y-3">
      {(monthEndSells > 0 || monthEndBuys > 0) && (
        <div className="flex flex-wrap gap-4 border-2 border-gray-600 bg-gray-100 px-4 py-2.5 font-mono text-xs">
          <span className="text-gray-500">
            at month-end:{" "}
            {monthEndSells > 0 && <span className="text-rose-500">sold {fmtDollar(monthEndSells)}</span>}
            {monthEndSells > 0 && monthEndBuys > 0 && <span className="text-gray-300"> · </span>}
            {monthEndBuys > 0 && <span className="text-emerald-600">bought {fmtDollar(monthEndBuys)}</span>}
          </span>
          {quarterEndSells > 0 && (
            <span className="text-gray-500">
              at quarter-end: <span className="text-rose-500">sold {fmtDollar(quarterEndSells)}</span>
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto border-2 border-gray-600">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Shares Δ</th>
              <th className="px-3 py-2 text-right">$ Flow</th>
              <th className="px-3 py-2 text-right">Shares After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {events.map((e) => {
              const mark = calMarkers.get(e.date);
              const isSell = e.flow_type === "SELL" || e.flow_type === "REMOVED";
              const isBuy = e.flow_type === "BUY" || e.flow_type === "ADDED";
              return (
                <tr
                  key={e.date}
                  className={` ${
                    mark === "Q"
                      ? "bg-blue-50 hover:bg-yellow-50"
                      : mark === "M"
                      ? "bg-gray-100 hover:bg-yellow-50"
                      : "hover:bg-yellow-50"
                  }`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/flows?etf=${etf}&date=${e.date}`}
                      className="font-mono text-xs text-gray-700 hover:text-blue-700"
                    >
                      {e.date}
                    </Link>
                    <CalMarker mark={mark} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-mono text-xs font-semibold ${FLOW_COLOR[e.flow_type]}`}>
                      {e.flow_type}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${isBuy ? "text-emerald-600" : isSell ? "text-rose-500" : "text-gray-500"}`}>
                    {e.shares_delta !== 0
                      ? `${e.shares_delta > 0 ? "+" : ""}${fmtNum(e.shares_delta)}`
                      : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${isBuy ? "text-emerald-600" : isSell ? "text-rose-500" : "text-gray-500"}`}>
                    {e.dollar_flow !== 0 ? fmtDollar(e.dollar_flow) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
                    {e.today_shares != null ? fmtNum(e.today_shares) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

const QUICK_EXAMPLES = [
  { label: "WFC-L", hint: "ticker" },
  { label: "JPM-D", hint: "ticker" },
  { label: "Financial Institutions", hint: "sector" },
  { label: "Utilities", hint: "sector" },
  { label: "Energy Transfer", hint: "issuer" },
  { label: "Canada", hint: "country" },
];

export default function SecurityPage({
  searchParams,
}: {
  searchParams: { q?: string; etf?: string; sector?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const filterEtf = searchParams.etf as EtfTicker | undefined;
  const filterSector = searchParams.sector?.trim() ?? "";

  // Build enrichment map (CUSIP / country / exchange) from all ETF holdings
  const enrichMap = buildEnrichmentMap();

  const matches = searchSecurities(q, enrichMap);

  // Apply ETF filter
  const etfFiltered = filterEtf ? matches.filter((m) => m.etf === filterEtf) : matches;

  // Apply sector filter
  const filtered = filterSector
    ? etfFiltered.filter((m) => (m.agg.sector ?? "").toLowerCase().includes(filterSector.toLowerCase()))
    : etfFiltered;

  // Unique sectors across all matches (for filter chips)
  const sectorSet: Record<string, true> = {};
  for (const m of matches) { if (m.agg.sector) sectorSet[m.agg.sector] = true; }
  const allSectors = Object.keys(sectorSet).sort();

  // Calendar markers per ETF
  const calMarkersByEtf = new Map<EtfTicker, Map<string, "Q" | "M">>();
  const etfsInResults = filtered.reduce<EtfTicker[]>((acc, m) => {
    if (!acc.includes(m.etf)) acc.push(m.etf);
    return acc;
  }, []);
  for (const etf of etfsInResults) {
    calMarkersByEtf.set(etf, buildCalendarMarkers(listFlowDates(etf)));
  }

  const showHistory = filtered.length <= 5;

  const BTN_ACTIVE = "border-gray-800 bg-gray-900 text-white";
  const BTN_INACTIVE = "border-gray-500 text-gray-500 hover:border-gray-400 hover:text-gray-900";

  function filterHref(params: { etf?: string; sector?: string }) {
    const parts: string[] = [];
    if (q) parts.push(`q=${encodeURIComponent(q)}`);
    if (params.etf) parts.push(`etf=${params.etf}`);
    if (params.sector) parts.push(`sector=${encodeURIComponent(params.sector)}`);
    return `/security?${parts.join("&")}`;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-gray-900">Security Lookup</h1>
        <p className="mt-0.5 font-mono text-xs text-gray-500">
          search by ticker · name · ISIN · CUSIP · sector · country · exchange
        </p>
      </div>

      {/* Search form */}
      <form method="GET" action="/security" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="WFC-L, Financial Institutions, Canada, US00206R3078…"
          autoFocus
          className="flex-1 border-2 border-gray-600 bg-white px-3 py-2 font-mono text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
        />
        {/* Preserve sector filter across searches */}
        {filterSector && <input type="hidden" name="sector" value={filterSector} />}
        <button
          type="submit"
          className="border-2 border-gray-600 bg-white px-4 py-2 font-mono text-xs text-gray-700 hover:bg-yellow-50 hover:border-gray-400"
        >
          search
        </button>
        {(q || filterEtf || filterSector) && (
          <a
            href="/security"
            className="border border-gray-500 px-3 py-2 font-mono text-xs text-gray-500 hover:text-gray-800"
            title="Clear all filters"
          >
            ✕
          </a>
        )}
      </form>

      {/* Filter chips — ETF + Sector */}
      {(q || filterSector) && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {/* ETF chips */}
          {matches.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] text-gray-400">ETF:</span>
              <a href={filterHref({ sector: filterSector })} className={` border px-2 py-0.5 font-mono text-[10px]  ${!filterEtf ? BTN_ACTIVE : BTN_INACTIVE}`}>
                all ({matches.length})
              </a>
              {SUPPORTED_ETFS.filter((etf) => matches.some((m) => m.etf === etf)).map((etf) => {
                const count = matches.filter((m) => m.etf === etf).length;
                return (
                  <a
                    key={etf}
                    href={filterHref({ etf, sector: filterSector })}
                    className={` border px-2 py-0.5 font-mono text-[10px] font-semibold  ${
                      filterEtf === etf ? BTN_ACTIVE : `${ETF_BADGE[etf] ?? ""} border-transparent hover:border-gray-300`
                    }`}
                  >
                    {etf} ({count})
                  </a>
                );
              })}
            </div>
          )}

          {/* Sector chips */}
          {allSectors.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] text-gray-400">sector:</span>
              <a href={filterHref({ etf: filterEtf })} className={` border px-2 py-0.5 font-mono text-[10px]  ${!filterSector ? BTN_ACTIVE : BTN_INACTIVE}`}>
                all
              </a>
              {allSectors.map((sector) => {
                const count = (filterEtf ? matches.filter((m) => m.etf === filterEtf) : matches)
                  .filter((m) => m.agg.sector === sector).length;
                return (
                  <a
                    key={sector}
                    href={filterHref({ etf: filterEtf, sector })}
                    className={` border px-2 py-0.5 font-mono text-[10px]  ${
                      filterSector === sector ? BTN_ACTIVE : "border-gray-500 text-gray-600 hover:border-gray-400 hover:text-gray-900"
                    }`}
                  >
                    {abbrevSector(sector)} ({count})
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* No query — show quick examples */}
      {!q && !filterSector && (
        <div className="border-2 border-gray-600 bg-white px-6 py-10 text-center space-y-4">
          <p className="font-mono text-sm text-gray-500">search any preferred security</p>
          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_EXAMPLES.map(({ label, hint }) => (
              <a
                key={label}
                href={`/security?q=${encodeURIComponent(label)}`}
                className="group flex flex-col items-center border border-gray-500 px-3 py-1.5 font-mono text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900"
              >
                <span>{label}</span>
                <span className="text-[10px] text-gray-400 group-hover:text-gray-500">{hint}</span>
              </a>
            ))}
          </div>
          <p className="font-mono text-[10px] text-gray-400">
            or browse by sector:
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {["Financial Institutions", "Utility", "Real Estate", "Industrial", "Energy"].map((s) => (
              <a
                key={s}
                href={`/security?sector=${encodeURIComponent(s)}`}
                className="border border-gray-500 px-3 py-1 font-mono text-[10px] text-gray-500 hover:border-gray-400 hover:text-gray-900"
              >
                {abbrevSector(s)}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Sector browse (no text query, sector filter active) */}
      {!q && filterSector && (
        <p className="font-mono text-xs text-gray-500">
          Browsing <span className="font-semibold text-gray-900">{filterSector}</span> · {filtered.length} securities
        </p>
      )}

      {/* No results */}
      {(q || filterSector) && filtered.length === 0 && matches.length === 0 && (
        <div className="border border-gray-500 px-6 py-10 text-center font-mono text-xs text-gray-400">
          {q
            ? `no securities found matching "${q}"`
            : `no securities found in sector "${filterSector}"`}
        </div>
      )}
      {(q || filterSector) && filtered.length === 0 && matches.length > 0 && (
        <div className="border border-gray-500 px-6 py-8 text-center font-mono text-xs text-gray-400">
          no results match the current filters —{" "}
          <a href={filterHref({})} className="text-blue-700 hover:text-blue-800">clear filters</a>
        </div>
      )}

      {/* Summary list (>5 matches) */}
      {filtered.length > 5 && (
        <div className="space-y-1.5">
          <p className="font-mono text-xs text-gray-500">
            {filtered.length} matches{filtered.length > 100 ? " — showing first 100" : ""} · narrow your search or pick a security to see full history
          </p>
          <div className="overflow-x-auto border-2 border-gray-600">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-500 bg-gray-300 text-left text-[10px] font-bold uppercase tracking-wider text-gray-800">
                  <th className="px-3 py-2">ETF</th>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">ISIN / CUSIP</th>
                  <th className="px-3 py-2">Streak</th>
                  <th className="px-3 py-2 text-right">Net Flow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {filtered.slice(0, 100).map((m) => (
                  <tr key={m.key} className="hover:bg-yellow-50">
                    <td className="px-3 py-2">
                      <span className={` px-1.5 py-0.5 font-mono text-xs font-semibold ${ETF_BADGE[m.etf] ?? "bg-gray-100 text-gray-500"}`}>
                        {m.etf}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`/security?q=${encodeURIComponent(m.agg.ticker ?? "")}&etf=${m.etf}`}
                        className="font-mono font-semibold text-gray-900 hover:text-blue-700"
                      >
                        {m.agg.ticker || "—"}
                      </a>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-gray-600">{m.agg.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{abbrevSector(m.agg.sector ?? "")}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{m.enrich?.country || "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-400">
                      <div>{m.agg.isin || "—"}</div>
                      {m.enrich?.cusip && <div className="text-gray-300">{m.enrich.cusip}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {m.agg.current_streak !== 0 ? (
                        <span className={m.agg.current_streak > 0 ? "text-emerald-600" : "text-rose-500"}>
                          {m.agg.current_streak > 0 ? "BUY" : "SELL"} ×{Math.abs(m.agg.current_streak)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono text-xs ${m.agg.net_dollar_flow >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {fmtDollar(m.agg.net_dollar_flow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail cards (≤5 matches) */}
      {filtered.length > 0 && showHistory && filtered.map((m) => {
        const calMarkers = calMarkersByEtf.get(m.etf) ?? new Map();
        const events = m.agg.history.filter((h) => h.flow_type !== "UNCHANGED");
        const totalSell = events
          .filter((e) => e.flow_type === "SELL" || e.flow_type === "REMOVED")
          .reduce((s, e) => s + Math.abs(e.dollar_flow), 0);
        const totalBuy = events
          .filter((e) => e.flow_type === "BUY" || e.flow_type === "ADDED")
          .reduce((s, e) => s + e.dollar_flow, 0);

        return (
          <div key={m.key} className="border-2 border-gray-600 bg-white">
            {/* Header */}
            <div className="flex flex-wrap items-start gap-3 border-b border-gray-500 px-4 py-3">
              <span className={` px-2 py-0.5 font-mono text-xs font-bold ${ETF_BADGE[m.etf] ?? ""}`}>
                {m.etf}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono font-bold text-gray-900 text-base">{m.agg.ticker || "—"}</span>
                  <span className="text-sm text-gray-600 truncate">{m.agg.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {m.agg.sector && (
                    <span className="bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-600">
                      {m.agg.sector}
                    </span>
                  )}
                  {m.enrich?.country && m.enrich.country !== "United States" && (
                    <span className="bg-blue-50 px-2 py-0.5 font-mono text-[10px] text-blue-700">
                      {m.enrich.country}
                    </span>
                  )}
                  {m.enrich?.exchange && m.enrich.exchange !== "-" && (
                    <span className="bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-500">
                      {m.enrich.exchange}
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-auto text-right font-mono text-[10px] text-gray-400 space-y-0.5">
                {m.agg.isin && <div>ISIN {m.agg.isin}</div>}
                {m.enrich?.cusip && <div>CUSIP {m.enrich.cusip}</div>}
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-gray-400 px-4 py-2 font-mono text-xs">
              <span className="text-gray-500">
                streak{" "}
                <span className={m.agg.current_streak > 0 ? "text-emerald-600" : m.agg.current_streak < 0 ? "text-rose-500" : "text-gray-500"}>
                  {m.agg.current_streak > 0
                    ? `BUY ×${m.agg.current_streak}`
                    : m.agg.current_streak < 0
                    ? `SELL ×${Math.abs(m.agg.current_streak)}`
                    : "flat"}
                </span>
              </span>
              <span className="text-gray-500">
                bought <span className="text-emerald-600">{fmtDollar(totalBuy)}</span>
              </span>
              <span className="text-gray-500">
                sold <span className="text-rose-500">{fmtDollar(totalSell)}</span>
              </span>
              <span className="text-gray-500">
                net <span className={m.agg.net_dollar_flow >= 0 ? "text-emerald-600" : "text-rose-500"}>
                  {fmtDollar(m.agg.net_dollar_flow)}
                </span>
              </span>
              <span className="text-gray-500">
                {events.length} events ·{" "}
                <Link href={`/flows?etf=${m.etf}`} className="text-blue-700 hover:text-blue-800">
                  latest flows →
                </Link>
              </span>
            </div>

            {/* History */}
            <div className="p-4">
              <SecurityHistory etf={m.etf} agg={m.agg} calMarkers={calMarkers} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
