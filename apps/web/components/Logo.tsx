const THREAD_COLORS = ["#00C48C", "#FFB020", "#FF5C77", "#6C5CE7"];

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      {[6, 16, 26, 34].map((y, i) => (
        <path
          key={y}
          d={`M 4 ${y} Q 17 ${y} 30 20`}
          stroke={THREAD_COLORS[i]}
          strokeWidth={i === 3 ? 2.4 : 1.8}
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}
      <circle cx={30} cy={20} r={4} fill="#6C5CE7" />
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size * 1.9} />
      <span
        className="font-display font-semibold tracking-tight text-text"
        style={{ fontSize: size }}
      >
        Polycast
      </span>
    </div>
  );
}
