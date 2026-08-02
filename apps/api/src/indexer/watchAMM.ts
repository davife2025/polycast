import { polycastAMMAbi } from "@polycast/abi";
import { formatUnits } from "viem";
import { publicClient } from "../lib/chain";
import { supabaseAdmin } from "../lib/supabase";
import { getMarketRowId } from "./db";
import { syncAmmPrice } from "./upsertAmm";

const watchedAMMs = new Set<string>();

async function recordEvent(params: {
  marketAddress: string;
  eventType: "buy" | "sell" | "liquidity_add" | "liquidity_remove";
  account?: string;
  amount?: bigint;
  txHash: string;
  blockNumber: bigint;
}) {
  const marketId = await getMarketRowId(params.marketAddress);
  if (!marketId) return;

  const { error } = await supabaseAdmin.from("market_events").upsert(
    {
      market_id: marketId,
      event_type: params.eventType,
      account: params.account ?? null,
      amount: params.amount !== undefined ? formatUnits(params.amount, 18) : null,
      tx_hash: params.txHash,
      block_number: Number(params.blockNumber),
    },
    { onConflict: "tx_hash" },
  );

  if (error) {
    console.error(`Failed to record ${params.eventType} event:`, error);
  }
}

/**
 * Subscribes to a single AMM's events. Safe to call more than once for
 * the same address — subsequent calls are a no-op.
 */
export function watchAMM(ammAddress: `0x${string}`, marketAddress: `0x${string}`) {
  if (watchedAMMs.has(ammAddress)) return;
  watchedAMMs.add(ammAddress);

  const amm = { address: ammAddress, abi: polycastAMMAbi } as const;

  publicClient.watchContractEvent({
    ...amm,
    eventName: "Bought",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "buy",
          account: log.args.trader,
          amount: log.args.collateralIn,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
      await syncAmmPrice(marketAddress, ammAddress);
    },
  });

  publicClient.watchContractEvent({
    ...amm,
    eventName: "Sold",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "sell",
          account: log.args.trader,
          amount: log.args.collateralOut,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
      await syncAmmPrice(marketAddress, ammAddress);
    },
  });

  publicClient.watchContractEvent({
    ...amm,
    eventName: "LiquidityAdded",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "liquidity_add",
          account: log.args.provider,
          amount: log.args.collateralIn,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
      // Liquidity additions on a balanced pool don't move price, but on
      // an already-imbalanced pool they can shift it slightly (see the
      // contract's documented SCOPE NOTE on addLiquidity) — re-sync to
      // be safe rather than assume no change.
      await syncAmmPrice(marketAddress, ammAddress);
    },
  });

  publicClient.watchContractEvent({
    ...amm,
    eventName: "LiquidityRemoved",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "liquidity_remove",
          account: log.args.provider,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
      await syncAmmPrice(marketAddress, ammAddress);
    },
  });

  console.log(`Watching AMM ${ammAddress} (market ${marketAddress}) for events`);
}
