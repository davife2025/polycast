"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertNewMarket = upsertNewMarket;
exports.syncMarketState = syncMarketState;
const viem_1 = require("viem");
const abi_1 = require("@polycast/abi");
const chain_1 = require("../lib/chain");
const supabase_1 = require("../lib/supabase");
const erc20_1 = require("./erc20");
const resolverType_1 = require("./resolverType");
/**
 * Called once when a market is first discovered (via MarketCreated),
 * to create its row in Supabase before any trading activity happens.
 */
async function upsertNewMarket(params) {
    const { marketAddress, question, collateralToken, resolverAddress } = params;
    const collateralSymbol = await (0, erc20_1.getTokenSymbol)(collateralToken);
    const resolverType = (0, resolverType_1.getResolverType)(resolverAddress);
    const { error } = await supabase_1.supabaseAdmin.from("markets").upsert({
        chain_market_address: marketAddress,
        question,
        collateral_token_address: collateralToken,
        collateral_symbol: collateralSymbol,
        resolver_address: resolverAddress,
        resolver_type: resolverType,
        status: "open",
    }, { onConflict: "chain_market_address" });
    if (error) {
        console.error(`Failed to upsert new market ${marketAddress}:`, error);
    }
    else {
        console.log(`Indexed new market ${marketAddress} (${collateralSymbol} collateral)`);
    }
}
/**
 * Re-reads a market's live state directly from the chain and syncs it
 * into Supabase. Called after every mint/merge/settle/redeem event.
 *
 * Deliberately re-reads rather than incrementally accumulating deltas —
 * the chain is the source of truth, and re-reading a handful of view
 * functions is cheap and immune to the indexer ever drifting out of sync
 * with on-chain reality (e.g. if an event were ever missed).
 */
async function syncMarketState(marketAddress) {
    const market = { address: marketAddress, abi: abi_1.polycastMarketAbi };
    const [totalCollateral, settled, outcome] = await Promise.all([
        chain_1.publicClient.readContract({ ...market, functionName: "totalCollateral" }),
        chain_1.publicClient.readContract({ ...market, functionName: "settled" }),
        chain_1.publicClient.readContract({ ...market, functionName: "outcome" }),
    ]);
    const { error } = await supabase_1.supabaseAdmin
        .from("markets")
        .update({
        // MVP proxy for "volume" until a real order book/AMM exists (Session 5) —
        // see the comment on this column in packages/supabase/schema.sql.
        volume_cached: (0, viem_1.formatUnits)(totalCollateral, 18),
        status: settled ? "resolved" : "open",
        resolved_outcome: settled ? Number(outcome) : null,
        resolved_at: settled ? new Date().toISOString() : null,
    })
        .eq("chain_market_address", marketAddress);
    if (error) {
        console.error(`Failed to sync market state for ${marketAddress}:`, error);
    }
}
//# sourceMappingURL=upsertMarket.js.map