"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

export function DateNav({
  selectedDate,
  prevDate,
  nextDate,
  etf,
  allDates,
}: {
  selectedDate: string;
  prevDate: string | null;
  nextDate: string | null;
  etf: string;
  allDates: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function navTo(date: string) {
    router.push(`/flows?date=${date}&etf=${etf}`);
  }

  const formatted = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Build a Set of valid dates for the calendar min/max and validation
  const dateSet = new Set(allDates);
  const minDate = allDates[allDates.length - 1]; // oldest (allDates is newest-first)
  const maxDate = allDates[0]; // newest

  return (
    <div className="flex items-center gap-1">
      {/* Prev (older) */}
      <button
        onClick={() => prevDate && navTo(prevDate)}
        disabled={!prevDate}
        className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
        title={prevDate ? `Go to ${prevDate}` : "No earlier date"}
      >
        ‹
      </button>

      {/* Date display — clicking opens the hidden date input */}
      <button
        onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
        className="relative flex h-8 items-center gap-1.5 rounded border border-slate-200 px-3 text-sm font-medium transition-colors hover:border-slate-400"
        title="Pick a date"
      >
        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {formatted}
        {/* Hidden date input */}
        <input
          ref={inputRef}
          type="date"
          value={selectedDate}
          min={minDate}
          max={maxDate}
          onChange={(e) => {
            const d = e.target.value;
            if (!d) return;
            // Snap to nearest available date if exact date not in set
            if (dateSet.has(d)) {
              navTo(d);
            } else {
              // Find closest available date
              const closest = allDates.reduce((a, b) =>
                Math.abs(new Date(b).getTime() - new Date(d).getTime()) <
                Math.abs(new Date(a).getTime() - new Date(d).getTime())
                  ? b
                  : a
              );
              navTo(closest);
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          style={{ colorScheme: "light" }}
        />
      </button>

      {/* Next (newer) */}
      <button
        onClick={() => nextDate && navTo(nextDate)}
        disabled={!nextDate}
        className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
        title={nextDate ? `Go to ${nextDate}` : "No later date"}
      >
        ›
      </button>
    </div>
  );
}
