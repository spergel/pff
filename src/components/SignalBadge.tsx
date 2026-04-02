import type { FlowType } from "@/src/types/pff";

const styles: Record<FlowType, string> = {
  ADDED: "bg-blue-100 text-blue-800",
  REMOVED: "bg-orange-100 text-orange-800",
  BUY: "bg-green-100 text-green-800",
  SELL: "bg-red-100 text-red-800",
  UNCHANGED: "bg-gray-100 text-gray-500",
  SUSPECT: "bg-yellow-100 text-yellow-800",
};

export function SignalBadge({ type }: { type: FlowType }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[type]}`}
    >
      {type}
    </span>
  );
}
