"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMarketAmmAddress = setMarketAmmAddress;
exports.syncAmmPrice = syncAmmPrice;
const viem_1 = require("viem");
const abi_1 = require("@polycast/abi");
const chain_1 = require("../lib/chain");
const supabase_1 = require("../lib/supabase");
/**
 * Called once, when an AMM is first discovered for a market (via
 * AMMCreated), to record its address on the market's row.
 */
async function setMarketAmmAddress(marketAddress, ammAddress) {
    const { error } = await supabase_1.supabaseAdmin
        .from("markets")
        .update({ amm_address: ammAddress })
        .eq("chain_market_address", marketAddress);
    if (error) {
        console.error(`Failed to set amm_address for market ${marketAddress}:`, error);
    }
}
/**
 * Re-reads the AMM's live price directly from the chain and syncs it
 * into the market's yes_price_cached column. Called after every AMM
 * event (buy, sell, liquidity add/remove) — same "re-read, don't
 * accumulate" philosophy as syncMarketState in upsertMarket.ts.
 */
async function syncAmmPrice(marketAddress, ammAddress) {
    const [yesPriceWad] = await chain_1.publicClient.readContract({
        address: ammAddress,
        abi: abi_1.polycastAMMAbi,
        functionName: "getPrices",
    });
    // yesPriceWad is 1e18-scaled (e.g. 0.73e18 for 73%). Values at this
    // scale exceed Number.MAX_SAFE_INTEGER, so we format it down to a
    // decimal string first (formatUnits) rather than calling Number()
    // directly on the raw bigint, which would silently lose precision.
    const yesPrice = Number((0, viem_1.formatUnits)(yesPriceWad, 18));
    const { error } = await supabase_1.supabaseAdmin
        .from("markets")
        .update({ yes_price_cached: yesPrice })
        .eq("chain_market_address", marketAddress);
    if (error) {
        console.error(`Failed to sync AMM price for market ${marketAddress}:`, error);
    }
}
//# sourceMappingURL=upsertAmm.js.map