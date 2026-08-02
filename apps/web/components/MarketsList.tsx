"use client";

import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import {
  polycastMarketFactoryContract,
  polycastMarketContract,
  polycastAMMFactoryContract,
  polycastAMMContract,
} from "@/lib/contracts";
import { marketFactoryAddress, ammFactoryAddress } from "@/lib/chain";

function StatusBadge({
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

function PriceBadge({ marketAddress }: { marketAddress: `0x${string}` }) {
  const ammFactoryDeployed = ammFactoryAddress.length > 0;

  const { data: ammAddress } = useReadContract({
    ...polycastAMMFactoryContract,
    functionName: "ammForMarket",
    args: [marketAddress],
    query: { enabled: ammFactoryDeployed },
  });

  const hasAMM =
    typeof ammAddress === "string" &&
    ammAddress !== "0x0000000000000000000000000000000000000000";

  const { data: priceData } = useReadContract({
    ...(hasAMM
      ? polycastAMMContract(ammAddress as `0x${string}`)
      : { address: undefined, abi: undefined }),
    functionName: "getPrices",
    query: { enabled: hasAMM },
  } as any);

  if (!hasAMM) return null;

  const [yesPriceWad] = (priceData as [bigint, bigint] | undefined) ?? [];
  if (yesPriceWad === undefined) return null;

  return (
    <span className="font-mono text-xs font-semibold text-positive">
      {(Number(yesPriceWad) / 1e16).toFixed(0)}% YES
    </span>
  );
}

function MarketCard({ address }: { address: `0x${string}` }) {
  const market = polycastMarketContract(address);

  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...market, functionName: "question" },
      { ...market, functionName: "totalCollateral" },
      { ...market, functionName: "settled" },
      { ...market, functionName: "outcome" },
    ],
  });

  if (isLoading || !data) {
    return (
      <div className="animate-pulse rounded-2xl border border-border bg-surface p-5">
        <div className="h-5 w-3/4 rounded bg-surface-alt" />
      </div>
    );
  }

  const [question, totalCollateral, settled, outcome] = data.map((d) => d.result);

  return (
    <Link href={`/markets/${address}`}>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_2px_10px_rgba(20,22,43,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(20,22,43,0.08)]">
        <div className="mb-3 flex items-start justify-between gap-4">
          <span className="font-body text-[15.5px] font-semibold leading-snug text-text">
            {question as string}
          </span>
          <StatusBadge
            settled={settled as boolean}
            outcome={Number(outcome ?? 0)}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-xs text-muted">
          <span>{formatUnits((totalCollateral as bigint) ?? 0n, 18)} collateral locked</span>
          <PriceBadge marketAddress={address} />
        </div>
      </div>
    </Link>
  );
}

export function MarketsList() {
  const factoryDeployed = marketFactoryAddress.length > 0;

  const { data: marketAddresses, isLoading } = useReadContract({
    ...polycastMarketFactoryContract,
    functionName: "getAllMarkets",
    query: { enabled: factoryDeployed },
  });

  if (!factoryDeployed) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center">
        <p className="font-mono text-sm text-muted">
          No factory deployed yet. Run{" "}
          <code className="rounded bg-border px-1.5 py-0.5">
            npm run deploy:coston2
          </code>{" "}
          in packages/contracts, then set{" "}
          <code className="rounded bg-border px-1.5 py-0.5">
            NEXT_PUBLIC_MARKET_FACTORY_ADDRESS
          </code>{" "}
          in your .env.local.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-3.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-border bg-surface"
          />
        ))}
      </div>
    );
  }

  const addresses = (marketAddresses as `0x${string}`[] | undefined) ?? [];

  if (addresses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center">
        <p className="text-sm text-muted">
          No markets created yet. Once one's deployed via the factory, it'll show up here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3.5">
      {addresses.map((address) => (
        <MarketCard key={address} address={address} />
      ))}
    </div>
  );
}
