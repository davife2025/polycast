"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchFactory = watchFactory;
const abi_1 = require("@polycast/abi");
const chain_1 = require("../lib/chain");
const upsertMarket_1 = require("./upsertMarket");
const watchMarket_1 = require("./watchMarket");
async function handleMarketCreated(log) {
    const { market, question, collateralToken, resolver } = log.args;
    if (!market || question === undefined || !collateralToken || !resolver) {
        console.warn("Received malformed MarketCreated log, skipping:", log);
        return;
    }
    await (0, upsertMarket_1.upsertNewMarket)({
        marketAddress: market,
        question,
        collateralToken,
        resolverAddress: resolver,
    });
    (0, watchMarket_1.watchMarket)(market);
}
/**
 * Starts watching the factory for MarketCreated events, after first
 * backfilling every market that already existed before the indexer
 * started (e.g. after a restart, or on first deploy). Chain is the
 * source of truth for discovery — Supabase state doesn't need to be
 * consulted here at all, since upsertNewMarket + watchMarket are both
 * safe to call repeatedly for the same market.
 */
async function watchFactory(factoryAddress) {
    const factory = { address: factoryAddress, abi: abi_1.polycastMarketFactoryAbi };
    console.log(`Backfilling existing markets from factory ${factoryAddress}...`);
    const existingLogs = await chain_1.publicClient.getContractEvents({
        ...factory,
        eventName: "MarketCreated",
        fromBlock: 0n,
        toBlock: "latest",
    });
    console.log(`Found ${existingLogs.length} existing market(s).`);
    for (const log of existingLogs) {
        await handleMarketCreated(log);
    }
    console.log("Watching factory for new markets...");
    chain_1.publicClient.watchContractEvent({
        ...factory,
        eventName: "MarketCreated",
        onLogs: async (logs) => {
            for (const log of logs) {
                await handleMarketCreated(log);
            }
        },
    });
}
//# sourceMappingURL=watchFactory.js.map