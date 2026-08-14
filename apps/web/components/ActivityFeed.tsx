"use client";

import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl, costonTwo } from "@/lib/chain";

interface MarketEvent {
  id: string;
  source: "market" | "amm" | "oracle_minter";
  event_type: string;
  account: string | null;
  amount: string | null;
  tx_hash: string;
  block_number: number;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  mint: "Minted pair",
  merge: "Merged pair",
  settle: "Settled",
  redeem: "Redeemed",
  buy: "Bought",
  sell: "Sold",
  liquidity_add: "Added liquidity",
  liquidity_remove: "Removed liquidity",
};

const SOURCE_LABELS: Record<string, string> = {
  market: "Market",
  amm: "AMM",
  oracle_minter: "Tracking",
};

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ActivityFeed({ marketAddress }: { marketAddress: `0x${string}` }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["market-events", marketAddress],
    queryFn: async () => {
      const res = await fetch(`${apiBaseUrl}/markets/by-address/${marketAddress}/events`);
      if (!res.ok) throw new Error(`Events request failed: ${res.status}`);
      const json = await res.json();
      return json.events as MarketEvent[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-alt" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-muted">
        Couldn&apos;t load activity — the backend API might not be
        running.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-xs text-muted">No activity yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <tbody>
          {data.map((event) => (
            <tr key={event.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <span className="font-mono text-xs font-semibold text-primary">
                  {SOURCE_LABELS[event.source] ?? event.source}
                </span>
              </td>
              <td className="px-4 py-3 text-text">
                {EVENT_LABELS[event.event_type] ?? event.event_type}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted">
                {event.account ? truncateAddress(event.account) : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted">
                {event.amount ?? "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <a
                  href={`${costonTwo.blockExplorers.default.url}/tx/${event.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary hover:underline"
                >
                  view tx
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
