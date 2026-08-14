"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchMarket = watchMarket;
const abi_1 = require("@polycast/abi");
const viem_1 = require("viem");
const chain_1 = require("../lib/chain");
const supabase_1 = require("../lib/supabase");
const upsertMarket_1 = require("./upsertMarket");
const db_1 = require("./db");
const watchedMarkets = new Set();
async function recordEvent(params) {
    const marketId = await (0, db_1.getMarketRowId)(params.marketAddress);
    if (!marketId)
        return;
    const { error } = await supabase_1.supabaseAdmin.from("market_events").upsert({
        market_id: marketId,
        source: "market",
        event_type: params.eventType,
        account: params.account ?? null,
        amount: params.amount !== undefined ? (0, viem_1.formatUnits)(params.amount, 18) : null,
        tx_hash: params.txHash,
        block_number: Number(params.blockNumber),
    }, { onConflict: "tx_hash" });
    if (error) {
        console.error(`Failed to record ${params.eventType} event:`, error);
    }
}
async function recordResolution(params) {
    const marketId = await (0, db_1.getMarketRowId)(params.marketAddress);
    if (!marketId)
        return;
    const { error } = await supabase_1.supabaseAdmin.from("resolutions").upsert({
        market_id: marketId,
        resolver_type: "unknown", // see resolverType.ts for why this isn't populated yet
        resolved_outcome: params.outcome,
        tx_hash: params.txHash,
    }, { onConflict: "tx_hash" });
    if (error) {
        console.error("Failed to record resolution:", error);
    }
}
/**
 * Subscribes to a single market's events. Safe to call more than once for
 * the same address — subsequent calls are a no-op, so the factory watcher
 * doesn't need to track what it's already subscribed to itself.
 */
function watchMarket(marketAddress) {
    if (watchedMarkets.has(marketAddress))
        return;
    watchedMarkets.add(marketAddress);
    const market = { address: marketAddress, abi: abi_1.polycastMarketAbi };
    chain_1.publicClient.watchContractEvent({
        ...market,
        eventName: "PairMinted",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "mint",
                    account: log.args.account,
                    amount: log.args.amount,
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
            }
            await (0, upsertMarket_1.syncMarketState)(marketAddress);
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...market,
        eventName: "PairMerged",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "merge",
                    account: log.args.account,
                    amount: log.args.amount,
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
            }
            await (0, upsertMarket_1.syncMarketState)(marketAddress);
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...market,
        eventName: "Redeemed",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "redeem",
                    account: log.args.account,
                    amount: log.args.amount,
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
            }
            await (0, upsertMarket_1.syncMarketState)(marketAddress);
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...market,
        eventName: "Settled",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "settle",
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
                await recordResolution({
                    marketAddress,
                    outcome: Number(log.args.outcome),
                    txHash: log.transactionHash,
                });
            }
            await (0, upsertMarket_1.syncMarketState)(marketAddress);
        },
    });
    console.log(`Watching market ${marketAddress} for events`);
}
//# sourceMappingURL=watchMarket.js.map