"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketRowId = getMarketRowId;
const supabase_1 = require("../lib/supabase");
/**
 * Looks up a market's Supabase row id by its on-chain address. Shared by
 * watchMarket.ts and watchAMM.ts so there's one place that knows how
 * markets are keyed, rather than each event watcher re-implementing the
 * same lookup.
 */
async function getMarketRowId(marketAddress) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from("markets")
        .select("id")
        .eq("chain_market_address", marketAddress)
        .single();
    if (error || !data) {
        console.error(`No markets row found for ${marketAddress} yet — event dropped`, error);
        return null;
    }
    return data.id;
}
//# sourceMappingURL=db.js.map