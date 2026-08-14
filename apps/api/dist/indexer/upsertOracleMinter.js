"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMarketOracleMinterAddress = setMarketOracleMinterAddress;
exports.syncOraclePriceForMarkets = syncOraclePriceForMarkets;
const viem_1 = require("viem");
const supabase_1 = require("../lib/supabase");
/**
 * Called once when an oracle minter is first discovered (via
 * OracleMinterCreated), to record its address plus which oracle/marketId
 * it reads from.
 */
async function setMarketOracleMinterAddress(params) {
    const { error } = await supabase_1.supabaseAdmin
        .from("markets")
        .update({
        oracle_minter_address: params.minterAddress,
        price_oracle_address: params.oracleAddress,
        oracle_market_id: params.oracleMarketId,
    })
        .eq("chain_market_address", params.marketAddress);
    if (error) {
        console.error(`Failed to set oracle minter info for market ${params.marketAddress}:`, error);
    }
}
/**
 * Updates yes_price_cached for every market registered against a given
 * (oracleAddress, oracleMarketId) pair — usually just one market, but
 * handled as a list since nothing stops two markets from tracking the
 * same external question.
 */
async function syncOraclePriceForMarkets(oracleAddress, oracleMarketId, yesPriceWad) {
    const yesPrice = Number((0, viem_1.formatUnits)(yesPriceWad, 18));
    const { error } = await supabase_1.supabaseAdmin
        .from("markets")
        .update({ yes_price_cached: yesPrice })
        .eq("price_oracle_address", oracleAddress)
        .eq("oracle_market_id", oracleMarketId);
    if (error) {
        console.error(`Failed to sync oracle price for oracleMarketId ${oracleMarketId}:`, error);
    }
}
//# sourceMappingURL=upsertOracleMinter.js.map