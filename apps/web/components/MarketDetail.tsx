"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { polycastMarketContract, erc20Abi } from "@/lib/contracts";
import { TradingPanel } from "./TradingPanel";
import { StatusBadge } from "./StatusBadge";

function ActionButton({
  onClick,
  disabled,
  pending,
  children,
  variant = "primary",
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const base =
    "rounded-lg px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? `${base} bg-primary text-white`
      : `${base} border border-border bg-surface text-text`;

  return (
    <button onClick={onClick} disabled={disabled || pending} className={styles}>
      {pending ? "Confirming…" : children}
    </button>
  );
}

function shortErrorMessage(error: unknown): string {
  if (!error) return "";
  const err = error as { shortMessage?: string; message?: string };
  return err.shortMessage ?? err.message ?? "Something went wrong.";
}

export function MarketDetail({ address }: { address: `0x${string}` }) {
  const { address: userAddress, isConnected } = useAccount();
  const market = polycastMarketContract(address);
  const [amountInput, setAmountInput] = useState("");

  const {
    data: marketData,
    error: marketError,
    isLoading: marketLoading,
    refetch: refetchMarket,
  } = useReadContracts({
    contracts: [
      { ...market, functionName: "question" },
      { ...market, functionName: "collateralToken" },
      { ...market, functionName: "totalCollateral" },
      { ...market, functionName: "settled" },
      { ...market, functionName: "outcome" },
    ],
  });

  const { data: userShareData, refetch: refetchUserShares } = useReadContracts({
    contracts: [
      { ...market, functionName: "balanceOf", args: [userAddress ?? "0x0", 1n] },
      { ...market, functionName: "balanceOf", args: [userAddress ?? "0x0", 0n] },
    ],
    query: { enabled: Boolean(userAddress) },
  });

  const [question, collateralToken, totalCollateral, settled, outcome] =
    marketData?.map((d) => d.result) ?? [];
  const [yesBalance, noBalance] = userShareData?.map((d) => d.result) ?? [];

  const collateralAddress = collateralToken as `0x${string}` | undefined;

  const { data: tokenMetaData } = useReadContracts({
    contracts: collateralAddress
      ? [
          { address: collateralAddress, abi: erc20Abi, functionName: "symbol" },
          { address: collateralAddress, abi: erc20Abi, functionName: "decimals" },
        ]
      : [],
    query: { enabled: Boolean(collateralAddress) },
  });

  const { data: tokenUserData, refetch: refetchToken } = useReadContracts({
    contracts:
      collateralAddress && userAddress
        ? [
            {
              address: collateralAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [userAddress],
            },
            {
              address: collateralAddress,
              abi: erc20Abi,
              functionName: "allowance",
              args: [userAddress, address],
            },
          ]
        : [],
    query: { enabled: Boolean(collateralAddress && userAddress) },
  });

  const [symbol, decimals] = tokenMetaData?.map((d) => d.result) ?? [];
  const [userCollateralBalance, allowance] = tokenUserData?.map((d) => d.result) ?? [];

  const tokenDecimals = (decimals as number | undefined) ?? 18;
  const parsedAmount = useMemo(() => {
    try {
      return amountInput ? parseUnits(amountInput, tokenDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amountInput, tokenDecimals]);

  const needsApproval =
    parsedAmount > 0n && ((allowance as bigint | undefined) ?? 0n) < parsedAmount;

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
  const txError = writeError || confirmError;

  function onApprove() {
    if (!collateralAddress) return;
    resetWrite();
    writeContract(
      {
        address: collateralAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [address, parsedAmount],
      },
      { onSuccess: () => refetchToken() },
    );
  }

  function onMint() {
    resetWrite();
    writeContract(
      { ...market, functionName: "mintPair", args: [parsedAmount] },
      { onSuccess: () => { refetchMarket(); refetchToken(); refetchUserShares(); } },
    );
  }

  function onMerge() {
    resetWrite();
    writeContract(
      { ...market, functionName: "mergePair", args: [parsedAmount] },
      { onSuccess: () => { refetchMarket(); refetchToken(); refetchUserShares(); } },
    );
  }

  function onSettle() {
    resetWrite();
    writeContract(
      { ...market, functionName: "settle", args: [] },
      { onSuccess: () => refetchMarket() },
    );
  }

  function onRedeem() {
    resetWrite();
    writeContract(
      { ...market, functionName: "redeem", args: [] },
      { onSuccess: () => { refetchMarket(); refetchToken(); refetchUserShares(); } },
    );
  }

  if (marketError) {
    return (
      <div className="rounded-2xl border border-dashed border-negative bg-negative-dim p-6 text-sm text-negative">
        Couldn&apos;t load this market: {shortErrorMessage(marketError)}
        <br />
        Check that your wallet is connected to Flare Coston2 and the
        address is correct.
      </div>
    );
  }

  if (marketLoading || !marketData) {
    return (
      <div className="space-y-4">
        <div className="h-3 w-48 animate-pulse rounded bg-surface-alt" />
        <div className="h-8 w-full animate-pulse rounded bg-surface-alt" />
        <div className="h-24 w-full animate-pulse rounded-2xl bg-surface-alt" />
      </div>
    );
  }

  const isSettled = Boolean(settled);
  const outcomeIsYes = Number(outcome ?? 0) === 1;
  const pending = writePending || txConfirming;

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 font-mono text-xs text-muted-dim">
          {address}
        </div>
        <h1 className="mb-3 font-display text-2xl font-semibold text-text">
          {question as string}
        </h1>
        <div className="flex items-center gap-3 font-mono text-xs">
          <StatusBadge settled={isSettled} outcome={Number(outcome ?? 0)} />
          <span className="text-muted">
            {formatUnits((totalCollateral as bigint) ?? 0n, tokenDecimals)}{" "}
            {(symbol as string) ?? ""} locked
          </span>
        </div>
      </div>

      <TradingPanel
        marketAddress={address}
        collateralAddress={collateralAddress}
        tokenDecimals={tokenDecimals}
        tokenSymbol={(symbol as string) ?? "collateral"}
      />

      {txError && (
        <div className="rounded-lg bg-negative-dim px-4 py-3 text-sm text-negative">
          {shortErrorMessage(txError)}
        </div>
      )}
      {txConfirmed && !txError && (
        <div className="rounded-lg bg-positive-dim px-4 py-3 text-sm text-positive">
          Transaction confirmed.
        </div>
      )}

      {!isConnected ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-6 text-center text-sm text-muted">
          Connect a wallet to trade this market.
        </div>
      ) : (
        <>
          {!isSettled && (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <div className="mb-4 font-mono text-xs uppercase tracking-wide text-muted-dim">
                Mint / merge outcome shares
              </div>
              <p className="mb-4 text-sm text-muted">
                Depositing collateral mints equal YES and NO shares.
                Merging does the reverse — burn equal YES + NO, get
                collateral back. Trading one side for the other happens
                by transferring shares directly (an order book/AMM lands
                in a later session).
              </p>
              <div className="mb-4 flex items-center gap-3">
                <input
                  type="text"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.0"
                  className="w-40 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
                />
                <span className="font-mono text-xs text-muted">
                  {(symbol as string) ?? "collateral"} — balance:{" "}
                  {formatUnits((userCollateralBalance as bigint) ?? 0n, tokenDecimals)}
                </span>
              </div>
              <div className="flex gap-3">
                {needsApproval ? (
                  <ActionButton onClick={onApprove} pending={pending} disabled={parsedAmount === 0n}>
                    Approve {(symbol as string) ?? ""}
                  </ActionButton>
                ) : (
                  <ActionButton onClick={onMint} pending={pending} disabled={parsedAmount === 0n}>
                    Mint pair
                  </ActionButton>
                )}
                <ActionButton
                  onClick={onMerge}
                  pending={pending}
                  disabled={parsedAmount === 0n}
                  variant="secondary"
                >
                  Merge pair
                </ActionButton>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="mb-4 font-mono text-xs uppercase tracking-wide text-muted-dim">
              Your position
            </div>
            <div className="mb-4 flex gap-6 font-mono text-sm">
              <div>
                <span className="text-positive">YES</span>:{" "}
                {formatUnits((yesBalance as bigint) ?? 0n, tokenDecimals)}
              </div>
              <div>
                <span className="text-negative">NO</span>:{" "}
                {formatUnits((noBalance as bigint) ?? 0n, tokenDecimals)}
              </div>
            </div>

            {!isSettled ? (
              <ActionButton onClick={onSettle} pending={pending} variant="secondary">
                Try to settle (needs resolver to have an answer)
              </ActionButton>
            ) : (
              <ActionButton
                onClick={onRedeem}
                pending={pending}
                disabled={
                  outcomeIsYes
                    ? ((yesBalance as bigint) ?? 0n) === 0n
                    : ((noBalance as bigint) ?? 0n) === 0n
                }
              >
                Redeem winning shares
              </ActionButton>
            )}
          </div>
        </>
      )}
    </div>
  );
}
