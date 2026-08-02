import { watchFactory } from "./watchFactory";
import { watchAMMFactory } from "./watchAMMFactory";

/**
 * Starts the indexer. Deliberately never throws — a chain/RPC problem
 * here shouldn't take down the whole API (markets endpoints still work
 * off whatever's already in Supabase from the last successful sync).
 *
 * Market discovery and AMM discovery are independent: a deployment might
 * have markets but no AMMs yet (or vice versa during a staged rollout),
 * so each is gated on its own env var rather than one blocking the other.
 */
export async function startIndexer() {
  const factoryAddress = process.env.MARKET_FACTORY_ADDRESS;
  const ammFactoryAddress = process.env.AMM_FACTORY_ADDRESS;

  if (!factoryAddress) {
    console.warn(
      "MARKET_FACTORY_ADDRESS not set — market indexing idle. " +
        "Deploy the factory (see packages/contracts) and set this env var to start indexing.",
    );
  } else {
    try {
      await watchFactory(factoryAddress as `0x${string}`);
    } catch (err) {
      console.error("Market indexer failed to start:", err);
    }
  }

  if (!ammFactoryAddress) {
    console.warn(
      "AMM_FACTORY_ADDRESS not set — AMM price indexing idle. " +
        "Deploy the AMM factory and set this env var to start tracking live prices.",
    );
  } else {
    try {
      await watchAMMFactory(ammFactoryAddress as `0x${string}`);
    } catch (err) {
      console.error("AMM indexer failed to start:", err);
    }
  }
}
