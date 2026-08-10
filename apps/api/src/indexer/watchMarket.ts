import { polycastMarketAbi } from "@polycast/abi";
import { formatUnits } from "viem";
import { publicClient } from "../lib/chain";
import { supabaseAdmin } from "../lib/supabase";
import { syncMarketState } from "./upsertMarket";
import { getMarketRowId } from "./db";

const watchedMarkets = new Set<string>();

async function recordEvent(params: {
  marketAddress: string;
  eventType: "mint" | "merge" | "settle" | "redeem";
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
      source: "market",
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

async function recordResolution(params: {
  marketAddress: string;
  outcome: number;
  txHash: string;
}) {
  const marketId = await getMarketRowId(params.marketAddress);
  if (!marketId) return;

  const { error } = await supabaseAdmin.from("resolutions").upsert(
    {
      market_id: marketId,
      resolver_type: "unknown", // see resolverType.ts for why this isn't populated yet
      resolved_outcome: params.outcome,
      tx_hash: params.txHash,
    },
    { onConflict: "tx_hash" },
  );

  if (error) {
    console.error("Failed to record resolution:", error);
  }
}

/**
 * Subscribes to a single market's events. Safe to call more than once for
 * the same address — subsequent calls are a no-op, so the factory watcher
 * doesn't need to track what it's already subscribed to itself.
 */
export function watchMarket(marketAddress: `0x${string}`) {
  if (watchedMarkets.has(marketAddress)) return;
  watchedMarkets.add(marketAddress);

  const market = { address: marketAddress, abi: polycastMarketAbi } as const;

  publicClient.watchContractEvent({
    ...market,
    eventName: "PairMinted",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "mint",
          account: log.args.account,
          amount: log.args.amount,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
      await syncMarketState(marketAddress);
    },
  });

  publicClient.watchContractEvent({
    ...market,
    eventName: "PairMerged",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "merge",
          account: log.args.account,
          amount: log.args.amount,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
      await syncMarketState(marketAddress);
    },
  });

  publicClient.watchContractEvent({
    ...market,
    eventName: "Redeemed",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "redeem",
          account: log.args.account,
          amount: log.args.amount,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }
      await syncMarketState(marketAddress);
    },
  });

  publicClient.watchContractEvent({
    ...market,
    eventName: "Settled",
    onLogs: async (logs) => {
      for (const log of logs) {
        await recordEvent({
          marketAddress,
          eventType: "settle",
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
        await recordResolution({
          marketAddress,
          outcome: Number(log.args.outcome),
          txHash: log.transactionHash,
        });
      }
      await syncMarketState(marketAddress);
    },
  });

  console.log(`Watching market ${marketAddress} for events`);
}
