import { watchFactory } from "./watchFactory";
import { watchAMMFactory } from "./watchAMMFactory";
import { watchOracleMinterFactory } from "./watchOracleMinterFactory";
import { watchPriceOracle } from "./watchPriceOracle";

/**
 * Starts the indexer. Deliberately never throws — a chain/RPC problem
 * here shouldn't take down the whole API (markets endpoints still work
 * off whatever's already in Supabase from the last successful sync).
 *
 * Market discovery, AMM discovery, and oracle-minter/price discovery are
 * all independent: a deployment might have any subset of these live at
 * once, so each is gated on its own env var rather than one blocking
 * the others.
 */
export async function startIndexer() {
  const factoryAddress = process.env.MARKET_FACTORY_ADDRESS;
  const ammFactoryAddress = process.env.AMM_FACTORY_ADDRESS;
  const oracleMinterFactoryAddress = process.env.ORACLE_MINTER_FACTORY_ADDRESS;
  const priceOracleAddress = process.env.PRICE_ORACLE_ADDRESS;

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

  if (!oracleMinterFactoryAddress) {
    console.warn(
      "ORACLE_MINTER_FACTORY_ADDRESS not set — tracking-market indexing idle.",
    );
  } else {
    try {
      await watchOracleMinterFactory(oracleMinterFactoryAddress as `0x${string}`);
    } catch (err) {
      console.error("Oracle minter indexer failed to start:", err);
    }
  }

  if (!priceOracleAddress) {
    console.warn(
      "PRICE_ORACLE_ADDRESS not set — tracking-market price sync idle.",
    );
  } else {
    try {
      watchPriceOracle(priceOracleAddress as `0x${string}`);
    } catch (err) {
      console.error("Price oracle watcher failed to start:", err);
    }
  }
}
