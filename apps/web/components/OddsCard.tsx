export interface OddsCardProps {
  label: string;
  yes: number; // 0-100
  volume: string;
  chains: number;
}

export function OddsCard({ label, yes, volume, chains }: OddsCardProps) {
  const isPositive = yes >= 50;
  const barColor = isPositive ? "bg-positive" : "bg-negative";
  const pillBg = isPositive ? "bg-positive-dim" : "bg-negative-dim";
  const pillText = isPositive ? "text-positive" : "text-negative";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_2px_10px_rgba(20,22,43,0.04)]">
      <div className="mb-3.5 flex items-start justify-between gap-4">
        <span className="font-body text-[15.5px] font-semibold leading-snug text-text">
          {label}
        </span>
        <div
          className={`whitespace-nowrap rounded-full px-3 py-1 font-mono text-[17px] font-bold ${pillBg} ${pillText}`}
        >
          {yes}%
        </div>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-alt">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${yes}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{volume} vol</span>
        <span className="rounded-full bg-warm-dim px-2 py-0.5 font-semibold text-[#B8791A]">
          {chains} chains settling
        </span>
      </div>
    </div>
  );
}
