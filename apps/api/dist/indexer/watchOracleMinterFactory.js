"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchOracleMinterFactory = watchOracleMinterFactory;
const abi_1 = require("@polycast/abi");
const chain_1 = require("../lib/chain");
const upsertOracleMinter_1 = require("./upsertOracleMinter");
const watchOracleMinter_1 = require("./watchOracleMinter");
async function handleOracleMinterCreated(log) {
    const { market, oracle, oracleMarketId, minter } = log.args;
    if (!market || !oracle || !oracleMarketId || !minter) {
        console.warn("Received malformed OracleMinterCreated log, skipping:", log);
        return;
    }
    await (0, upsertOracleMinter_1.setMarketOracleMinterAddress)({
        marketAddress: market,
        minterAddress: minter,
        oracleAddress: oracle,
        oracleMarketId,
    });
    (0, watchOracleMinter_1.watchOracleMinter)(minter, market);
}
/**
 * Starts watching the oracle minter factory for new minters, after first
 * backfilling every one that already existed before the indexer
 * started. Same backfill-then-live pattern as watchFactory.ts and
 * watchAMMFactory.ts.
 */
async function watchOracleMinterFactory(factoryAddress) {
    const factory = { address: factoryAddress, abi: abi_1.polycastOracleMinterFactoryAbi };
    console.log(`Backfilling existing oracle minters from factory ${factoryAddress}...`);
    const existingLogs = await chain_1.publicClient.getContractEvents({
        ...factory,
        eventName: "OracleMinterCreated",
        fromBlock: 0n,
        toBlock: "latest",
    });
    console.log(`Found ${existingLogs.length} existing oracle minter(s).`);
    for (const log of existingLogs) {
        await handleOracleMinterCreated(log);
    }
    console.log("Watching oracle minter factory for new minters...");
    chain_1.publicClient.watchContractEvent({
        ...factory,
        eventName: "OracleMinterCreated",
        onLogs: async (logs) => {
            for (const log of logs) {
                await handleOracleMinterCreated(log);
            }
        },
    });
}
//# sourceMappingURL=watchOracleMinterFactory.js.map