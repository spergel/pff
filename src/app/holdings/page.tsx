import { fmtDollar } from "@/src/lib/fmt";
import {
  listHoldingDates,
  loadHoldings,
  SUPPORTED_ETFS,
} from "@/src/lib/data";
import type { EtfTicker } from "@/src/lib/data";
import { HoldingsTable } from "@/src/components/HoldingsTable";

// ─── calendar grid ─────────────────────────────────────────────────────────

function buildCalendar(dates: string[], selectedDate: string) {
  if (!dates.length) return null;

  // Group dates by YYYY-MM
  const byMonth: Record<string, Set<string>> = {};
  for (const d of dates) {
    const m = d.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = new Set();
    byMonth[m].add(d);
  }

  // Show the month containing the selected date, or the most recent month
  const targetMonth = selectedDate ? selectedDate.slice(0, 7) : dates[0].slice(0, 7);
  const datesInMonth = byMonth[targetMonth] ?? new Set<string>();

  const [year, month] = targetMonth.split("-").map(Number);
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return { targetMonth, datesInMonth, firstDow, daysInMonth, prevMonth, nextMonth, monthLabel };
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function HoldingsPage({
  searchParams,
}: {
  searchParams: { etf?: string; date?: string; month?: string };
}) {
  const etf = (SUPPORTED_ETFS.includes(searchParams.etf as EtfTicker)
    ? searchParams.etf
    : "PFF") as EtfTicker;

  const allDates = listHoldingDates(etf);
  const selectedDate = allDates.includes(searchParams.date ?? "")
    ? searchParams.date!
    : allDates[0] ?? "";

  const holdings = selectedDate ? loadHoldings(selectedDate, etf) : [];
  const aum = holdings.reduce((s, h) => s + (h.mkt_val ?? 0), 0);

  // Calendar: use ?month= param to navigate months, otherwise use selected date's month
  const displayMonth = searchParams.month ?? (selectedDate ? selectedDate.slice(0, 7) : "");
  const cal = buildCalendar(allDates, displayMonth || selectedDate);

  function etfHref(e: string) {
    return `/holdings?etf=${e}`;
  }

  function dateHref(d: string) {
    return `/holdings?etf=${etf}&date=${d}`;
  }

  function monthHref(m: string) {
    return `/holdings?etf=${etf}&date=${selectedDate}&month=${m}`;
  }

  const ETF_COLORS: Record<string, string> = {
    PFF: "border-blue-700 bg-blue-700",
    PGX: "border-purple-600 bg-purple-600",
    FPE: "border-amber-600 bg-amber-600",
    PFFA: "border-green-600 bg-green-600",
  };
  const ETF_ACTIVE_TEXT: Record<string, string> = {
    PFF: "text-blue-700",
    PGX: "text-purple-600",
    FPE: "text-amber-600",
    PFFA: "text-green-600",
  };

  return (
    <div className="space-y-5">
      {/* Header row — sticky */}
      <div className="sticky top-0 z-20 -mx-4 -mt-5 mb-0 bg-gray-200 px-4 pt-5 pb-3 lg:-mx-6 lg:px-6 flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-gray-900">Holdings</h1>

        {/* ETF dropdown tabs */}
        <div className="flex gap-1">
          {SUPPORTED_ETFS.map((e) => (
            <a
              key={e}
              href={etfHref(e)}
              className={`border px-3 py-1 font-mono text-xs font-semibold ${
                etf === e
                  ? `${ETF_COLORS[e] ?? "border-gray-800 bg-gray-800"} text-white`
                  : "border-gray-500 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {e}
            </a>
          ))}
        </div>

        {/* Stats */}
        {selectedDate && (
          <span className="font-mono text-xs text-gray-500">
            {holdings.length} securities ·{" "}
            <span className={ETF_ACTIVE_TEXT[etf] ?? "text-gray-900"}>{fmtDollar(aum)} AUM</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
        {/* ─── Calendar sidebar ─── */}
        <div className="space-y-3 sticky top-14 self-start">
          {cal ? (
            <div className="border-2 border-gray-600 bg-white">
              {/* Month nav */}
              <div className="flex items-center justify-between border-b-2 border-gray-600 px-3 py-2">
                <a
                  href={monthHref(cal.prevMonth)}
                  className="font-mono text-sm text-gray-500 hover:text-gray-900"
                >
                  ‹
                </a>
                <span className="font-mono text-xs font-bold text-gray-800">{cal.monthLabel}</span>
                <a
                  href={monthHref(cal.nextMonth)}
                  className="font-mono text-sm text-gray-500 hover:text-gray-900"
                >
                  ›
                </a>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 border-b border-gray-400">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="py-1 text-center font-mono text-[10px] font-bold text-gray-400">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 p-1 gap-0.5">
                {/* Leading blanks */}
                {Array.from({ length: cal.firstDow }).map((_, i) => (
                  <div key={`blank-${i}`} />
                ))}
                {/* Days */}
                {Array.from({ length: cal.daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${cal.targetMonth}-${String(day).padStart(2, "0")}`;
                  const hasData = cal.datesInMonth.has(dateStr);
                  const isSelected = dateStr === selectedDate;

                  if (!hasData) {
                    return (
                      <div
                        key={day}
                        className="py-1 text-center font-mono text-xs text-gray-300"
                      >
                        {day}
                      </div>
                    );
                  }

                  return (
                    <a
                      key={day}
                      href={dateHref(dateStr)}
                      className={`py-1 text-center font-mono text-xs font-semibold ${
                        isSelected
                          ? `${ETF_COLORS[etf] ?? "bg-gray-800"} text-white`
                          : "bg-gray-100 text-gray-700 hover:bg-yellow-100"
                      }`}
                    >
                      {day}
                    </a>
                  );
                })}
              </div>

              {/* All dates list for this ETF */}
              <div className="border-t border-gray-400 px-3 py-2">
                <p className="mb-1 font-mono text-[10px] font-bold uppercase text-gray-400">All Dates</p>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {allDates.map((d) => (
                    <a
                      key={d}
                      href={dateHref(d)}
                      className={`block font-mono text-xs px-1 py-0.5 ${
                        d === selectedDate
                          ? `${ETF_ACTIVE_TEXT[etf] ?? "text-gray-900"} font-bold`
                          : "text-gray-600 hover:text-gray-900 hover:bg-yellow-50"
                      }`}
                    >
                      {d}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-gray-500 px-4 py-6 text-center font-mono text-xs text-gray-400">
              no holdings data
            </div>
          )}
        </div>

        {/* ─── Holdings table ─── */}
        <div>
          {!selectedDate || !holdings.length ? (
            <div className="border border-gray-500 px-6 py-12 text-center font-mono text-xs text-gray-400">
              no holdings data for this date — run the scraper to populate
            </div>
          ) : (
            <div className="border-2 border-gray-600 bg-white p-4">
              <HoldingsTable holdings={holdings} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
