"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchAMMFactory = watchAMMFactory;
const abi_1 = require("@polycast/abi");
const chain_1 = require("../lib/chain");
const upsertAmm_1 = require("./upsertAmm");
const watchAMM_1 = require("./watchAMM");
async function handleAMMCreated(log) {
    const { market, amm } = log.args;
    if (!market || !amm) {
        console.warn("Received malformed AMMCreated log, skipping:", log);
        return;
    }
    await (0, upsertAmm_1.setMarketAmmAddress)(market, amm);
    await (0, upsertAmm_1.syncAmmPrice)(market, amm);
    (0, watchAMM_1.watchAMM)(amm, market);
}
/**
 * Starts watching the AMM factory for AMMCreated events, after first
 * backfilling every AMM that already existed before the indexer started.
 * Mirrors watchFactory.ts's structure exactly — same reasoning applies
 * (chain is the source of truth for discovery, safe to restart anytime).
 */
async function watchAMMFactory(ammFactoryAddress) {
    const ammFactory = { address: ammFactoryAddress, abi: abi_1.polycastAMMFactoryAbi };
    console.log(`Backfilling existing AMMs from factory ${ammFactoryAddress}...`);
    const existingLogs = await chain_1.publicClient.getContractEvents({
        ...ammFactory,
        eventName: "AMMCreated",
        fromBlock: 0n,
        toBlock: "latest",
    });
    console.log(`Found ${existingLogs.length} existing AMM(s).`);
    for (const log of existingLogs) {
        await handleAMMCreated(log);
    }
    console.log("Watching AMM factory for new AMMs...");
    chain_1.publicClient.watchContractEvent({
        ...ammFactory,
        eventName: "AMMCreated",
        onLogs: async (logs) => {
            for (const log of logs) {
                await handleAMMCreated(log);
            }
        },
    });
}
//# sourceMappingURL=watchAMMFactory.js.map