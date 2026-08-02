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

export function MarketDetail({ address }: { address: `0x${string}` }) {
  const { address: userAddress, isConnected } = useAccount();
  const market = polycastMarketContract(address);
  const [amountInput, setAmountInput] = useState("");

  const { data: marketData, refetch: refetchMarket } = useReadContracts({
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

  const { writeContract, data: txHash, isPending: writePending } = useWriteContract();
  const { isLoading: txConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      // refetch everything once a transaction confirms, so the UI reflects
      // the new balances/state without the user needing to reload
    },
  });

  function onApprove() {
    if (!collateralAddress) return;
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
    writeContract(
      { ...market, functionName: "mintPair", args: [parsedAmount] },
      { onSuccess: () => { refetchMarket(); refetchToken(); refetchUserShares(); } },
    );
  }

  function onMerge() {
    writeContract(
      { ...market, functionName: "mergePair", args: [parsedAmount] },
      { onSuccess: () => { refetchMarket(); refetchToken(); refetchUserShares(); } },
    );
  }

  function onSettle() {
    writeContract(
      { ...market, functionName: "settle", args: [] },
      { onSuccess: () => refetchMarket() },
    );
  }

  function onRedeem() {
    writeContract(
      { ...market, functionName: "redeem", args: [] },
      { onSuccess: () => { refetchMarket(); refetchToken(); refetchUserShares(); } },
    );
  }

  if (!marketData) {
    return <div className="font-mono text-sm text-muted">Loading market…</div>;
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
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              isSettled
                ? outcomeIsYes
                  ? "bg-positive-dim text-positive"
                  : "bg-negative-dim text-negative"
                : "bg-primary-dim text-primary"
            }`}
          >
            {isSettled ? `Resolved: ${outcomeIsYes ? "YES" : "NO"}` : "Open"}
          </span>
          <span className="text-muted">
            {formatUnits((totalCollateral as bigint) ?? 0n, tokenDecimals)}{" "}
            {(symbol as string) ?? ""} locked
          </span>
        </div>
      </div>

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
