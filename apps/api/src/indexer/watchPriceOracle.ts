import { polymarketPriceOracleAbi } from "@polycast/abi";
import { publicClient } from "../lib/chain";
import { syncOraclePriceForMarkets } from "./upsertOracleMinter";

/**
 * Watches a PolymarketPriceOracle contract for PriceUpdated events and
 * keeps every market registered against it in sync. This is
 * deliberately separate from watchOracleMinter.ts — a tracking market's
 * price changes continuously as the relayer polls Polymarket (every
 * ~15s by default), independent of whether anyone happens to trade at
 * that moment. Syncing only on trade events would leave the cached
 * price stale between trades, which defeats the point of a "live
 * tracking" market.
 */
export function watchPriceOracle(oracleAddress: `0x${string}`) {
  publicClient.watchContractEvent({
    address: oracleAddress,
    abi: polymarketPriceOracleAbi,
    eventName: "PriceUpdated",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { marketId, yesPriceWad } = log.args;
        if (marketId === undefined || yesPriceWad === undefined) continue;
        await syncOraclePriceForMarkets(oracleAddress, marketId, yesPriceWad);
      }
    },
  });

  console.log(`Watching price oracle ${oracleAddress} for price updates`);
}
