"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

export function DateNav({
  selectedDate,
  prevDate,
  nextDate,
  etf,
  allDates,
  basePath = "/flows",
  extraParams = "",
}: {
  selectedDate: string;
  prevDate: string | null;
  nextDate: string | null;
  etf: string;
  allDates: string[];
  basePath?: string;
  extraParams?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function navTo(date: string) {
    const suffix = extraParams ? `&${extraParams}` : "";
    router.push(`${basePath}?date=${date}&etf=${etf}${suffix}`);
  }

  const formatted = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const dateSet = new Set(allDates);
  const minDate = allDates[allDates.length - 1];
  const maxDate = allDates[0];

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => prevDate && navTo(prevDate)}
        disabled={!prevDate}
        className="flex h-7 w-7 items-center justify-center border border-gray-500 font-mono text-gray-500 hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
        title={prevDate ? `Go to ${prevDate}` : "No earlier date"}
      >
        ‹
      </button>

      <button
        onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
        className="relative flex h-7 items-center gap-1.5 border border-gray-500 px-2.5 font-mono text-xs text-gray-700 hover:border-gray-400 hover:text-gray-900"
        title="Pick a date"
      >
        <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {formatted}
        <input
          ref={inputRef}
          type="date"
          value={selectedDate}
          min={minDate}
          max={maxDate}
          onChange={(e) => {
            const d = e.target.value;
            if (!d) return;
            if (dateSet.has(d)) {
              navTo(d);
            } else {
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

      <button
        onClick={() => nextDate && navTo(nextDate)}
        disabled={!nextDate}
        className="flex h-7 w-7 items-center justify-center border border-gray-500 font-mono text-gray-500 hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
        title={nextDate ? `Go to ${nextDate}` : "No later date"}
      >
        ›
      </button>
    </div>
  );
}
