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
  polycastOracleMinterFactoryContract,
  polycastOracleMinterContract,
  erc20Abi,
} from "@/lib/contracts";
import { oracleMinterFactoryAddress } from "@/lib/chain";

function shortErrorMessage(error: unknown): string {
  if (!error) return "";
  const err = error as { shortMessage?: string; message?: string };
  return err.shortMessage ?? err.message ?? "Something went wrong.";
}

function pct(priceWad: bigint | undefined) {
  if (priceWad === undefined) return "—";
  return `${(Number(priceWad) / 1e16).toFixed(1)}%`;
}

export function TrackingPanel({
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
  const [outcome, setOutcome] = useState<0 | 1>(1);
  const [amountInput, setAmountInput] = useState("");

  const factoryDeployed = oracleMinterFactoryAddress.length > 0;

  const { data: minterAddress } = useReadContract({
    ...polycastOracleMinterFactoryContract,
    functionName: "minterForMarket",
    args: [marketAddress],
    query: { enabled: factoryDeployed },
  });

  const hasMinter =
    typeof minterAddress === "string" &&
    minterAddress !== "0x0000000000000000000000000000000000000000";

  const minter = hasMinter
    ? polycastOracleMinterContract(minterAddress as `0x${string}`)
    : null;

  const { data: yesPriceData, refetch: refetchPrice } = useReadContract({
    ...(minter ?? { address: undefined, abi: undefined }),
    functionName: "currentPrice",
    args: [1n],
    query: { enabled: Boolean(minter) },
  } as any);
  const { data: noPriceData } = useReadContract({
    ...(minter ?? { address: undefined, abi: undefined }),
    functionName: "currentPrice",
    args: [0n],
    query: { enabled: Boolean(minter) },
  } as any);

  const [yesPriceWad, yesFresh] = (yesPriceData as [bigint, boolean] | undefined) ?? [];
  const [noPriceWad] = (noPriceData as [bigint, boolean] | undefined) ?? [];

  const { data: allowanceData, refetch: refetchAllowance } = useReadContracts({
    contracts:
      collateralAddress && userAddress && minter
        ? [
            {
              address: collateralAddress,
              abi: erc20Abi,
              functionName: "allowance",
              args: [userAddress, minter.address],
            },
          ]
        : [],
    query: { enabled: Boolean(collateralAddress && userAddress && minter) },
  });
  const allowance = allowanceData?.[0]?.result as bigint | undefined;

  const parsedAmount = useMemo(() => {
    try {
      return amountInput ? parseUnits(amountInput, tokenDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amountInput, tokenDecimals]);

  const {
    writeContract,
    data: txHash,
    isPending: writePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();
  const {
    isLoading: txConfirming,
    isSuccess: txConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash: txHash });
  const pending = writePending || txConfirming;
  const txError = writeError || confirmError;

  function onApprove() {
    if (!collateralAddress || !minter) return;
    resetWrite();
    writeContract(
      {
        address: collateralAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [minter.address, parsedAmount],
      },
      { onSuccess: () => refetchAllowance() },
    );
  }

  function onBuy() {
    if (!minter) return;
    resetWrite();
    // minTokensOut left permissive (0) here — same caveat as
    // TradingPanel.tsx's AMM version: a production UI should compute an
    // expected quote client-side and set a real slippage bound.
    writeContract(
      { ...minter, functionName: "buy", args: [BigInt(outcome), parsedAmount, 0n] },
      { onSuccess: () => refetchPrice() },
    );
  }

  function onSell() {
    if (!minter) return;
    resetWrite();
    writeContract(
      {
        ...minter,
        functionName: "sell",
        args: [BigInt(outcome), parsedAmount, 0n],
      },
      { onSuccess: () => refetchPrice() },
    );
  }

  if (!factoryDeployed || !hasMinter) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-6 text-center text-sm text-muted">
        No tracking market deployed for this question yet.
      </div>
    );
  }

  const needsApproval =
    side === "buy" && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  return (
    <div className="rounded-2xl border border-warm bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-wide text-muted-dim">
          Tracking Polymarket's live odds
        </div>
        <div className="flex gap-4 font-mono text-sm">
          <span className="text-positive">
            YES {pct(yesPriceWad)}
            {yesFresh === false && <span className="text-warm"> (stale)</span>}
          </span>
          <span className="text-negative">NO {pct(noPriceWad)}</span>
        </div>
      </div>

      <div className="mb-4 rounded-lg bg-warm-dim px-3 py-2 text-xs text-[#B8791A]">
        <strong>This is not an AMM.</strong> Trades happen directly against
        the quoted price above — liquidity providers here are the direct
        counterparty to every trade, not protected by a pricing curve.
        See the market docs before providing liquidity.
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
              placeholder={
                side === "buy" ? `${tokenSymbol} to spend` : "shares to sell"
              }
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
            />
          </div>

          {side === "buy" ? (
            needsApproval ? (
              <button
                onClick={onApprove}
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
            <button
              onClick={onSell}
              disabled={pending || parsedAmount === 0n}
              className="w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Confirming…" : `Sell ${outcome === 1 ? "YES" : "NO"}`}
            </button>
          )}

          {txError && (
            <div className="mt-3 rounded-lg bg-negative-dim px-3 py-2 text-xs text-negative">
              {shortErrorMessage(txError)}
            </div>
          )}
          {txConfirmed && !txError && (
            <div className="mt-3 rounded-lg bg-positive-dim px-3 py-2 text-xs text-positive">
              Transaction confirmed.
            </div>
          )}
        </>
      )}
    </div>
  );
}
