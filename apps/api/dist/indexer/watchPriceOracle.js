"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchPriceOracle = watchPriceOracle;
const abi_1 = require("@polycast/abi");
const chain_1 = require("../lib/chain");
const upsertOracleMinter_1 = require("./upsertOracleMinter");
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
function watchPriceOracle(oracleAddress) {
    chain_1.publicClient.watchContractEvent({
        address: oracleAddress,
        abi: abi_1.polymarketPriceOracleAbi,
        eventName: "PriceUpdated",
        onLogs: async (logs) => {
            for (const log of logs) {
                const { marketId, yesPriceWad } = log.args;
                if (marketId === undefined || yesPriceWad === undefined)
                    continue;
                await (0, upsertOracleMinter_1.syncOraclePriceForMarkets)(oracleAddress, marketId, yesPriceWad);
            }
        },
    });
    console.log(`Watching price oracle ${oracleAddress} for price updates`);
}
//# sourceMappingURL=watchPriceOracle.js.map