import { polycastOracleMinterAbi } from "@polycast/abi";
import { formatUnits } from "viem";
import { publicClient } from "../lib/chain";
import { supabaseAdmin } from "../lib/supabase";
import { getMarketRowId } from "./db";

const watchedMinters = new Set<string>();

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
      source: "oracle_minter",
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
 * Subscribes to a single oracle minter's events. Note this does NOT
 * sync price on trade events the way watchAMM.ts does — a tracking
 * market's price comes from the oracle continuously (see
 * watchPriceOracle.ts), independent of whether anyone happens to be
 * trading at that moment. Trade events here are purely for the activity
 * log.
 */
export function watchOracleMinter(minterAddress: `0x${string}`, marketAddress: `0x${string}`) {
  if (watchedMinters.has(minterAddress)) return;
  watchedMinters.add(minterAddress);

  const minter = { address: minterAddress, abi: polycastOracleMinterAbi } as const;

  publicClient.watchContractEvent({
    ...minter,
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
    },
  });

  publicClient.watchContractEvent({
    ...minter,
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
    },
  });

  publicClient.watchContractEvent({
    ...minter,
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
    },
  });

  publicClient.watchContractEvent({
    ...minter,
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
    },
  });

  console.log(`Watching oracle minter ${minterAddress} (market ${marketAddress}) for events`);
}
