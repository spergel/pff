import type { FlowType } from "@/src/types/pff";

const styles: Record<FlowType, string> = {
  ADDED: "bg-blue-100 text-blue-800",
  REMOVED: "bg-orange-100 text-orange-700",
  BUY: "bg-emerald-100 text-emerald-700",
  SELL: "bg-rose-100 text-rose-700",
  UNCHANGED: "bg-gray-100 text-gray-500",
  SUSPECT: "bg-yellow-100 text-yellow-700",
};

export function SignalBadge({ type }: { type: FlowType }) {
  return (
    <span
      className={`inline-block  px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${styles[type]}`}
    >
      {type}
    </span>
  );
}
