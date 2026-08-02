import { watchFactory } from "./watchFactory";

/**
 * Starts the indexer. Deliberately never throws — a chain/RPC problem
 * here shouldn't take down the whole API (markets endpoints still work
 * off whatever's already in Supabase from the last successful sync).
 */
export async function startIndexer() {
  const factoryAddress = process.env.MARKET_FACTORY_ADDRESS;

  if (!factoryAddress) {
    console.warn(
      "MARKET_FACTORY_ADDRESS not set — indexer idle. " +
        "Deploy the factory (see packages/contracts) and set this env var to start indexing.",
    );
    return;
  }

  try {
    await watchFactory(factoryAddress as `0x${string}`);
  } catch (err) {
    console.error("Indexer failed to start:", err);
  }
}
