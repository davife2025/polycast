"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { polycastMarketContract } from "@/lib/contracts";
import { apiBaseUrl } from "@/lib/chain";

interface PortfolioMarket {
  id: string;
  chain_market_address: `0x${string}`;
  question: string;
  collateral_symbol: string;
  status: string;
}

function PositionRow({ market }: { market: PortfolioMarket }) {
  const { address: userAddress } = useAccount();
  const contract = polycastMarketContract(market.chain_market_address);

  const { data } = useReadContracts({
    contracts: userAddress
      ? [
          { ...contract, functionName: "balanceOf", args: [userAddress, 1n] },
          { ...contract, functionName: "balanceOf", args: [userAddress, 0n] },
        ]
      : [],
    query: { enabled: Boolean(userAddress) },
  });

  const [yesBalance, noBalance] = data?.map((d) => d.result as bigint | undefined) ?? [];
  const hasPosition = (yesBalance ?? 0n) > 0n || (noBalance ?? 0n) > 0n;

  if (!hasPosition) return null;

  return (
    <Link href={`/markets/${market.chain_market_address}`}>
      <div className="rounded-2xl border border-border bg-surface p-5 hover:shadow-[0_4px_16px_rgba(20,22,43,0.08)]">
        <div className="mb-3 flex items-start justify-between gap-4">
          <span className="font-body text-[15px] font-semibold text-text">
            {market.question}
          </span>
          <span className="rounded-full bg-primary-dim px-2.5 py-1 font-mono text-xs font-semibold text-primary">
            {market.status}
          </span>
        </div>
        <div className="flex gap-6 font-mono text-sm">
          <span className="text-positive">
            YES: {formatUnits(yesBalance ?? 0n, 18)}
          </span>
          <span className="text-negative">
            NO: {formatUnits(noBalance ?? 0n, 18)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PortfolioList() {
  const { address: userAddress, isConnected } = useAccount();

  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio", userAddress],
    queryFn: async () => {
      const res = await fetch(`${apiBaseUrl}/portfolio/${userAddress}`);
      if (!res.ok) throw new Error(`Portfolio request failed: ${res.status}`);
      const json = await res.json();
      return json.markets as PortfolioMarket[];
    },
    enabled: Boolean(userAddress),
  });

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center text-sm text-muted">
        Connect a wallet to see your positions.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-3.5">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-negative bg-negative-dim p-8 text-center text-sm text-negative">
        Couldn&apos;t load your portfolio — the backend API might not be
        running or configured. See SETUP.md.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center text-sm text-muted">
        No positions found. Once you mint, buy, or trade in a market,
        it&apos;ll show up here.
      </div>
    );
  }

  return (
    <div className="grid gap-3.5">
      {data.map((market) => (
        <PositionRow key={market.id} market={market} />
      ))}
    </div>
  );
}
