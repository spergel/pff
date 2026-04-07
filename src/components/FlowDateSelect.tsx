"use client";

export function FlowDateSelect({
  dates,
  selectedDate,
}: {
  dates: string[];
  selectedDate: string;
}) {
  return (
    <select
      name="date"
      defaultValue={selectedDate}
      onChange={(e) => {
        const url = new URL(window.location.href);
        url.searchParams.set("date", e.target.value);
        window.location.href = url.toString();
      }}
      className="rounded border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
    >
      {dates.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
