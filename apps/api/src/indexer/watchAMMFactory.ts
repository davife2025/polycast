import { polycastAMMFactoryAbi } from "@polycast/abi";
import { publicClient } from "../lib/chain";
import { setMarketAmmAddress, syncAmmPrice } from "./upsertAmm";
import { watchAMM } from "./watchAMM";

async function handleAMMCreated(log: {
  args: { market?: `0x${string}`; amm?: `0x${string}` };
}) {
  const { market, amm } = log.args;
  if (!market || !amm) {
    console.warn("Received malformed AMMCreated log, skipping:", log);
    return;
  }

  await setMarketAmmAddress(market, amm);
  await syncAmmPrice(market, amm);
  watchAMM(amm, market);
}

/**
 * Starts watching the AMM factory for AMMCreated events, after first
 * backfilling every AMM that already existed before the indexer started.
 * Mirrors watchFactory.ts's structure exactly — same reasoning applies
 * (chain is the source of truth for discovery, safe to restart anytime).
 */
export async function watchAMMFactory(ammFactoryAddress: `0x${string}`) {
  const ammFactory = { address: ammFactoryAddress, abi: polycastAMMFactoryAbi } as const;

  console.log(`Backfilling existing AMMs from factory ${ammFactoryAddress}...`);
  const existingLogs = await publicClient.getContractEvents({
    ...ammFactory,
    eventName: "AMMCreated",
    fromBlock: 0n,
    toBlock: "latest",
  });

  console.log(`Found ${existingLogs.length} existing AMM(s).`);
  for (const log of existingLogs) {
    await handleAMMCreated(log as any);
  }

  console.log("Watching AMM factory for new AMMs...");
  publicClient.watchContractEvent({
    ...ammFactory,
    eventName: "AMMCreated",
    onLogs: async (logs) => {
      for (const log of logs) {
        await handleAMMCreated(log as any);
      }
    },
  });
}
