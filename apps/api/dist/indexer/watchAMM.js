"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchAMM = watchAMM;
const abi_1 = require("@polycast/abi");
const viem_1 = require("viem");
const chain_1 = require("../lib/chain");
const supabase_1 = require("../lib/supabase");
const db_1 = require("./db");
const upsertAmm_1 = require("./upsertAmm");
const watchedAMMs = new Set();
async function recordEvent(params) {
    const marketId = await (0, db_1.getMarketRowId)(params.marketAddress);
    if (!marketId)
        return;
    const { error } = await supabase_1.supabaseAdmin.from("market_events").upsert({
        market_id: marketId,
        source: "amm",
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
/**
 * Subscribes to a single AMM's events. Safe to call more than once for
 * the same address — subsequent calls are a no-op.
 */
function watchAMM(ammAddress, marketAddress) {
    if (watchedAMMs.has(ammAddress))
        return;
    watchedAMMs.add(ammAddress);
    const amm = { address: ammAddress, abi: abi_1.polycastAMMAbi };
    chain_1.publicClient.watchContractEvent({
        ...amm,
        eventName: "Bought",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "buy",
                    account: log.args.trader,
                    amount: log.args.collateralIn,
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
            }
            await (0, upsertAmm_1.syncAmmPrice)(marketAddress, ammAddress);
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...amm,
        eventName: "Sold",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "sell",
                    account: log.args.trader,
                    amount: log.args.collateralOut,
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
            }
            await (0, upsertAmm_1.syncAmmPrice)(marketAddress, ammAddress);
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...amm,
        eventName: "LiquidityAdded",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "liquidity_add",
                    account: log.args.provider,
                    amount: log.args.collateralIn,
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
            }
            // Liquidity additions on a balanced pool don't move price, but on
            // an already-imbalanced pool they can shift it slightly (see the
            // contract's documented SCOPE NOTE on addLiquidity) — re-sync to
            // be safe rather than assume no change.
            await (0, upsertAmm_1.syncAmmPrice)(marketAddress, ammAddress);
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...amm,
        eventName: "LiquidityRemoved",
        onLogs: async (logs) => {
            for (const log of logs) {
                await recordEvent({
                    marketAddress,
                    eventType: "liquidity_remove",
                    account: log.args.provider,
                    txHash: log.transactionHash,
                    blockNumber: log.blockNumber,
                });
            }
            await (0, upsertAmm_1.syncAmmPrice)(marketAddress, ammAddress);
        },
    });
    console.log(`Watching AMM ${ammAddress} (market ${marketAddress}) for events`);
}
//# sourceMappingURL=watchAMM.js.map