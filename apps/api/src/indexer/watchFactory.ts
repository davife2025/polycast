import { polycastMarketFactoryAbi } from "@polycast/abi";
import { publicClient } from "../lib/chain";
import { upsertNewMarket } from "./upsertMarket";
import { watchMarket } from "./watchMarket";

async function handleMarketCreated(log: {
  args: {
    market?: `0x${string}`;
    question?: string;
    collateralToken?: `0x${string}`;
    resolver?: `0x${string}`;
  };
}) {
  const { market, question, collateralToken, resolver } = log.args;
  if (!market || question === undefined || !collateralToken || !resolver) {
    console.warn("Received malformed MarketCreated log, skipping:", log);
    return;
  }

  await upsertNewMarket({
    marketAddress: market,
    question,
    collateralToken,
    resolverAddress: resolver,
  });
  watchMarket(market);
}

/**
 * Starts watching the factory for MarketCreated events, after first
 * backfilling every market that already existed before the indexer
 * started (e.g. after a restart, or on first deploy). Chain is the
 * source of truth for discovery — Supabase state doesn't need to be
 * consulted here at all, since upsertNewMarket + watchMarket are both
 * safe to call repeatedly for the same market.
 */
export async function watchFactory(factoryAddress: `0x${string}`) {
  const factory = { address: factoryAddress, abi: polycastMarketFactoryAbi } as const;

  console.log(`Backfilling existing markets from factory ${factoryAddress}...`);
  const existingLogs = await publicClient.getContractEvents({
    ...factory,
    eventName: "MarketCreated",
    fromBlock: 0n,
    toBlock: "latest",
  });

  console.log(`Found ${existingLogs.length} existing market(s).`);
  for (const log of existingLogs) {
    await handleMarketCreated(log as any);
  }

  console.log("Watching factory for new markets...");
  publicClient.watchContractEvent({
    ...factory,
    eventName: "MarketCreated",
    onLogs: async (logs) => {
      for (const log of logs) {
        await handleMarketCreated(log as any);
      }
    },
  });
}
