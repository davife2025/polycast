"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  polycastAMMFactoryContract,
  polycastAMMContract,
  polycastMarketContract,
  erc20Abi,
} from "@/lib/contracts";
import { ammFactoryAddress } from "@/lib/chain";

function pct(priceWad: bigint | undefined) {
  if (priceWad === undefined) return "—";
  return `${(Number(priceWad) / 1e16).toFixed(1)}%`;
}

export function TradingPanel({
  marketAddress,
  collateralAddress,
  tokenDecimals,
  tokenSymbol,
}: {
  marketAddress: `0x${string}`;
  collateralAddress: `0x${string}` | undefined;
  tokenDecimals: number;
  tokenSymbol: string;
}) {
  const { address: userAddress, isConnected } = useAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [outcome, setOutcome] = useState<0 | 1>(1); // 1 = YES, 0 = NO
  const [amountInput, setAmountInput] = useState("");

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

  const amm = hasAMM ? polycastAMMContract(ammAddress as `0x${string}`) : null;

  const { data: priceData, refetch: refetchPrices } = useReadContract({
    ...(amm ?? { address: undefined, abi: undefined }),
    functionName: "getPrices",
    query: { enabled: Boolean(amm) },
  } as any);

  const [yesPriceWad, noPriceWad] = (priceData as [bigint, bigint] | undefined) ?? [];

  const { data: allowanceData, refetch: refetchAllowance } = useReadContracts({
    contracts:
      collateralAddress && userAddress && amm
        ? [
            {
              address: collateralAddress,
              abi: erc20Abi,
              functionName: "allowance",
              args: [userAddress, amm.address],
            },
          ]
        : [],
    query: { enabled: Boolean(collateralAddress && userAddress && amm) },
  });
  const allowance = allowanceData?.[0]?.result as bigint | undefined;

  const parsedAmount = useMemo(() => {
    try {
      return amountInput ? parseUnits(amountInput, tokenDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amountInput, tokenDecimals]);

  const { writeContract, data: txHash, isPending: writePending } = useWriteContract();
  const { isLoading: txConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const pending = writePending || txConfirming;

  function onApproveCollateral() {
    if (!collateralAddress || !amm) return;
    writeContract(
      {
        address: collateralAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [amm.address, parsedAmount],
      },
      { onSuccess: () => refetchAllowance() },
    );
  }

  function onApproveShares() {
    if (!amm) return;
    writeContract({
      ...polycastMarketContract(marketAddress),
      functionName: "setApprovalForAll",
      args: [amm.address, true],
    });
  }

  function onBuy() {
    if (!amm) return;
    // minTokensOut left at 0 here for simplicity — a production UI should
    // compute an expected tokensOut client-side (mirroring the contract's
    // formula) and set a real slippage bound instead of accepting any price.
    writeContract(
      { ...amm, functionName: "buy", args: [BigInt(outcome), parsedAmount, 0n] },
      { onSuccess: () => refetchPrices() },
    );
  }

  function onSell() {
    if (!amm) return;
    // maxTokensIn set to a large ceiling for the same reason noted in onBuy —
    // a production UI should compute this properly for real slippage protection.
    const maxTokensIn = parsedAmount * 1000n;
    writeContract(
      { ...amm, functionName: "sell", args: [BigInt(outcome), parsedAmount, maxTokensIn] },
      { onSuccess: () => refetchPrices() },
    );
  }

  if (!ammFactoryDeployed || !hasAMM) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-6 text-center text-sm text-muted">
        No AMM deployed for this market yet — trading happens via mint/merge
        below until one's created (see{" "}
        <code className="rounded bg-border px-1.5 py-0.5">
          PolycastAMMFactory.createAMM
        </code>{" "}
        in packages/contracts).
      </div>
    );
  }

  const needsCollateralApproval =
    side === "buy" && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-wide text-muted-dim">
          Trade
        </div>
        <div className="flex gap-4 font-mono text-sm">
          <span className="text-positive">YES {pct(yesPriceWad)}</span>
          <span className="text-negative">NO {pct(noPriceWad)}</span>
        </div>
      </div>

      {!isConnected ? (
        <div className="text-sm text-muted">Connect a wallet to trade.</div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setSide("buy")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                side === "buy" ? "bg-primary text-white" : "border border-border text-muted"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                side === "sell" ? "bg-primary text-white" : "border border-border text-muted"
              }`}
            >
              Sell
            </button>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setOutcome(1)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  outcome === 1 ? "bg-positive-dim text-positive" : "border border-border text-muted"
                }`}
              >
                YES
              </button>
              <button
                onClick={() => setOutcome(0)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  outcome === 0 ? "bg-negative-dim text-negative" : "border border-border text-muted"
                }`}
              >
                NO
              </button>
            </div>
          </div>

          <div className="mb-4">
            <input
              type="text"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder={side === "buy" ? `${tokenSymbol} to spend` : "shares to sell"}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
            />
          </div>

          {side === "buy" ? (
            needsCollateralApproval ? (
              <button
                onClick={onApproveCollateral}
                disabled={pending || parsedAmount === 0n}
                className="w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Confirming…" : `Approve ${tokenSymbol}`}
              </button>
            ) : (
              <button
                onClick={onBuy}
                disabled={pending || parsedAmount === 0n}
                className="w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Confirming…" : `Buy ${outcome === 1 ? "YES" : "NO"}`}
              </button>
            )
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onApproveShares}
                disabled={pending}
                className="flex-1 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text disabled:opacity-50"
              >
                {pending ? "Confirming…" : "Approve shares"}
              </button>
              <button
                onClick={onSell}
                disabled={pending || parsedAmount === 0n}
                className="flex-1 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Confirming…" : `Sell ${outcome === 1 ? "YES" : "NO"}`}
              </button>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Selling requires a one-time approval on the market contract
            (standard ERC-1155 operator approval) before the first sell.
          </p>
        </>
      )}
    </div>
  );
}
