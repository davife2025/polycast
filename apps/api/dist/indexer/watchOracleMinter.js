"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchOracleMinter = watchOracleMinter;
const abi_1 = require("@polycast/abi");
const viem_1 = require("viem");
const chain_1 = require("../lib/chain");
const supabase_1 = require("../lib/supabase");
const db_1 = require("./db");
const watchedMinters = new Set();
async function recordEvent(params) {
    const marketId = await (0, db_1.getMarketRowId)(params.marketAddress);
    if (!marketId)
        return;
    const { error } = await supabase_1.supabaseAdmin.from("market_events").upsert({
        market_id: marketId,
        source: "oracle_minter",
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
 * Subscribes to a single oracle minter's events. Note this does NOT
 * sync price on trade events the way watchAMM.ts does — a tracking
 * market's price comes from the oracle continuously (see
 * watchPriceOracle.ts), independent of whether anyone happens to be
 * trading at that moment. Trade events here are purely for the activity
 * log.
 */
function watchOracleMinter(minterAddress, marketAddress) {
    if (watchedMinters.has(minterAddress))
        return;
    watchedMinters.add(minterAddress);
    const minter = { address: minterAddress, abi: abi_1.polycastOracleMinterAbi };
    chain_1.publicClient.watchContractEvent({
        ...minter,
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
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...minter,
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
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...minter,
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
        },
    });
    chain_1.publicClient.watchContractEvent({
        ...minter,
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
        },
    });
    console.log(`Watching oracle minter ${minterAddress} (market ${marketAddress}) for events`);
}
//# sourceMappingURL=watchOracleMinter.js.map