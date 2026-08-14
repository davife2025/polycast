import { polycastOracleMinterFactoryAbi } from "@polycast/abi";
import { publicClient } from "../lib/chain";
import { getContractEventsChunked } from "./getLogsChunked";
import { setMarketOracleMinterAddress } from "./upsertOracleMinter";
import { watchOracleMinter } from "./watchOracleMinter";

async function handleOracleMinterCreated(log: {
  args: {
    market?: `0x${string}`;
    oracle?: `0x${string}`;
    oracleMarketId?: `0x${string}`;
    minter?: `0x${string}`;
  };
}) {
  const { market, oracle, oracleMarketId, minter } = log.args;
  if (!market || !oracle || !oracleMarketId || !minter) {
    console.warn("Received malformed OracleMinterCreated log, skipping:", log);
    return;
  }

  await setMarketOracleMinterAddress({
    marketAddress: market,
    minterAddress: minter,
    oracleAddress: oracle,
    oracleMarketId,
  });
  watchOracleMinter(minter, market);
}

/**
 * Starts watching the oracle minter factory for new minters, after first
 * backfilling every one that already existed before the indexer
 * started. Same backfill-then-live pattern as watchFactory.ts and
 * watchAMMFactory.ts.
 */
export async function watchOracleMinterFactory(factoryAddress: `0x${string}`) {
  const factory = { address: factoryAddress, abi: polycastOracleMinterFactoryAbi } as const;

  console.log(`Backfilling existing oracle minters from factory ${factoryAddress}...`);
  const existingLogs = await getContractEventsChunked({
    ...factory,
    eventName: "OracleMinterCreated",
    fromBlock: 0n,
  });

  console.log(`Found ${existingLogs.length} existing oracle minter(s).`);
  for (const log of existingLogs) {
    await handleOracleMinterCreated(log as any);
  }

  console.log("Watching oracle minter factory for new minters...");
  publicClient.watchContractEvent({
    ...factory,
    eventName: "OracleMinterCreated",
    onLogs: async (logs) => {
      for (const log of logs) {
        await handleOracleMinterCreated(log as any);
      }
    },
  });
}
