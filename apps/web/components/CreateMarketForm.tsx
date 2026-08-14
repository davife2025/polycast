"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { decodeEventLog, keccak256, toBytes } from "viem";
import { polycastMarketFactoryContract } from "@/lib/contracts";
import { marketFactoryAddress } from "@/lib/chain";
import { polycastMarketFactoryAbi } from "@polycast/abi";

function shortErrorMessage(error: unknown): string {
  if (!error) return "";
  const err = error as { shortMessage?: string; message?: string };
  return err.shortMessage ?? err.message ?? "Something went wrong.";
}

export function CreateMarketForm() {
  const router = useRouter();
  const { isConnected } = useAccount();

  const [question, setQuestion] = useState("");
  const [collateralToken, setCollateralToken] = useState("");
  const [resolverAddress, setResolverAddress] = useState("");

  const factoryDeployed = marketFactoryAddress.length > 0;

  const {
    writeContract,
    data: txHash,
    isPending: writePending,
    error: writeError,
  } = useWriteContract();
  const {
    data: receipt,
    isLoading: txConfirming,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const pending = writePending || txConfirming;
  const txError = writeError || confirmError;

  // Once the transaction confirms, pull the new market's address out of
  // the MarketCreated event and navigate straight to it — no need to
  // separately look it up.
  useEffect(() => {
    if (!receipt) return;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: polycastMarketFactoryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "MarketCreated") {
          const marketAddress = (decoded.args as { market: `0x${string}` }).market;
          router.push(`/markets/${marketAddress}`);
          return;
        }
      } catch {
        // not a log this ABI can decode, skip
      }
    }
  }, [receipt, router]);

  function isValidAddress(value: string): value is `0x${string}` {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }

  const canSubmit =
    question.trim().length > 0 &&
    isValidAddress(collateralToken) &&
    isValidAddress(resolverAddress);

  function onSubmit() {
    if (!canSubmit) return;
    // A unique id per market — derived from the question plus a
    // timestamp so creating the same question twice doesn't collide.
    const marketId = keccak256(toBytes(`${question}:${Date.now()}`));
    writeContract({
      ...polycastMarketFactoryContract,
      functionName: "createMarket",
      args: [
        marketId,
        question,
        collateralToken as `0x${string}`,
        resolverAddress as `0x${string}`,
      ],
    });
  }

  if (!factoryDeployed) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center text-sm text-muted">
        No factory deployed yet — see SETUP.md.
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-8 text-center text-sm text-muted">
        Connect a wallet to create a market.
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text">Question</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Will X happen by <date>?"
          rows={2}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text">
          Collateral token address
        </label>
        <input
          type="text"
          value={collateralToken}
          onChange={(e) => setCollateralToken(e.target.value)}
          placeholder="0x..."
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
        />
        <p className="mt-1 text-xs text-muted">
          An ERC-20 token address on Coston2 (e.g. the test collateral
          from your deploy output).
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text">
          Resolver address
        </label>
        <input
          type="text"
          value={resolverAddress}
          onChange={(e) => setResolverAddress(e.target.value)}
          placeholder="0x..."
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text"
        />
        <p className="mt-1 text-xs text-muted">
          The deployed <code>ManualResolver</code> address is the
          simplest option for a new market — see your deploy output or{" "}
          <code>RESOLVER_TYPE_MAP</code> in apps/api/.env.
        </p>
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit || pending}
        className="w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Confirming…" : "Create market"}
      </button>

      {txError && (
        <div className="rounded-lg bg-negative-dim px-3 py-2 text-xs text-negative">
          {shortErrorMessage(txError)}
        </div>
      )}
    </div>
  );
}
