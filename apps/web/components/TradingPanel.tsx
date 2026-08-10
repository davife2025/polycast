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

function shortErrorMessage(error: unknown): string {
  if (!error) return "";
  const err = error as { shortMessage?: string; message?: string };
  return err.shortMessage ?? err.message ?? "Something went wrong.";
}

const FEE_BPS = 200n; // must match PolycastAMM.sol's FEE_BPS constant
const BPS_DENOMINATOR = 10_000n;
const SLIPPAGE_BPS = 100n; // 1% default tolerance

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** Mirrors PolycastAMM.sol's buy() formula exactly, fee included. */
function quoteBuy(
  outcome: 0 | 1,
  collateralIn: bigint,
  yesReserve: bigint,
  noReserve: bigint,
): bigint {
  if (yesReserve === 0n || noReserve === 0n || collateralIn === 0n) return 0n;
  const k = yesReserve * noReserve;
  const fee = (collateralIn * FEE_BPS) / BPS_DENOMINATOR;
  const netIn = collateralIn - fee;

  if (outcome === 1) {
    const otherAfter = noReserve + netIn;
    return yesReserve + netIn - ceilDiv(k, otherAfter);
  }
  const otherAfter = yesReserve + netIn;
  return noReserve + netIn - ceilDiv(k, otherAfter);
}

/** Mirrors PolycastAMM.sol's sell() formula exactly (no fee yet on sell). */
function quoteSell(
  outcome: 0 | 1,
  collateralOut: bigint,
  yesReserve: bigint,
  noReserve: bigint,
): bigint {
  if (collateralOut === 0n) return 0n;
  const k = yesReserve * noReserve;

  if (outcome === 1) {
    if (noReserve <= collateralOut) return 0n;
    const otherAfterRemoval = noReserve - collateralOut;
    return ceilDiv(k, otherAfterRemoval) + collateralOut - yesReserve;
  }
  if (yesReserve <= collateralOut) return 0n;
  const otherAfterRemoval = yesReserve - collateralOut;
  return ceilDiv(k, otherAfterRemoval) + collateralOut - noReserve;
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

  const { data: reservesData, refetch: refetchReserves } = useReadContract({
    ...(amm ?? { address: undefined, abi: undefined }),
    functionName: "getReserves",
    query: { enabled: Boolean(amm) },
  } as any);

  const [yesReserve, noReserve] = (reservesData as [bigint, bigint] | undefined) ?? [0n, 0n];

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

  const quotedAmount = useMemo(() => {
    if (parsedAmount === 0n) return 0n;
    return side === "buy"
      ? quoteBuy(outcome, parsedAmount, yesReserve, noReserve)
      : quoteSell(outcome, parsedAmount, yesReserve, noReserve);
  }, [side, outcome, parsedAmount, yesReserve, noReserve]);

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

  function onApproveCollateral() {
    if (!collateralAddress || !amm) return;
    resetWrite();
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
    resetWrite();
    writeContract({
      ...polycastMarketContract(marketAddress),
      functionName: "setApprovalForAll",
      args: [amm.address, true],
    });
  }

  function onBuy() {
    if (!amm) return;
    resetWrite();
    // minTokensOut computed from the same formula the contract itself
    // uses (quoteBuy, mirroring PolycastAMM.sol's buy()), with a 1%
    // tolerance for reserves moving between quote and confirmation.
    const minTokensOut =
      quotedAmount > 0n
        ? (quotedAmount * (BPS_DENOMINATOR - SLIPPAGE_BPS)) / BPS_DENOMINATOR
        : 0n;
    writeContract(
      { ...amm, functionName: "buy", args: [BigInt(outcome), parsedAmount, minTokensOut] },
      { onSuccess: () => { refetchPrices(); refetchReserves(); } },
    );
  }

  function onSell() {
    if (!amm) return;
    resetWrite();
    // maxTokensIn computed the same way, via quoteSell (mirroring the
    // contract's sell() formula), with the same 1% tolerance.
    const maxTokensIn =
      quotedAmount > 0n
        ? (quotedAmount * (BPS_DENOMINATOR + SLIPPAGE_BPS)) / BPS_DENOMINATOR
        : parsedAmount * 2n; // fallback if quote isn't available yet
    writeContract(
      { ...amm, functionName: "sell", args: [BigInt(outcome), parsedAmount, maxTokensIn] },
      { onSuccess: () => { refetchPrices(); refetchReserves(); } },
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
              placeholder={
                side === "buy"
                  ? `${tokenSymbol} to spend`
                  : `${tokenSymbol} you want to receive`
              }
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
            />
            {parsedAmount > 0n && (
              <p className="mt-2 font-mono text-xs text-muted">
                {side === "buy"
                  ? `≈ ${formatUnits(quotedAmount, tokenDecimals)} ${outcome === 1 ? "YES" : "NO"} shares (2% fee included, 1% slippage tolerance)`
                  : `≈ ${formatUnits(quotedAmount, tokenDecimals)} ${outcome === 1 ? "YES" : "NO"} shares needed (1% slippage tolerance)`}
              </p>
            )}
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
