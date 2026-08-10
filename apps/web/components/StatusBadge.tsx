export function StatusBadge({
  settled,
  outcome,
}: {
  settled: boolean;
  outcome: number;
}) {
  if (!settled) {
    return (
      <span className="rounded-full bg-primary-dim px-2.5 py-1 font-mono text-xs font-semibold text-primary">
        Open
      </span>
    );
  }
  const isYes = outcome === 1;
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${
        isYes ? "bg-positive-dim text-positive" : "bg-negative-dim text-negative"
      }`}
    >
      Resolved: {isYes ? "YES" : "NO"}
    </span>
  );
}
