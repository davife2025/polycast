"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portfolioRoutes = portfolioRoutes;
const supabase_1 = require("../lib/supabase");
async function portfolioRoutes(app) {
    // GET /portfolio/:address — every market this address has ever
    // interacted with (mint/merge/buy/sell/liquidity), from the indexed
    // event history. This is a starting point for the frontend to then
    // check *live* on-chain balances for just these markets, rather than
    // needing to brute-force-check every market that exists.
    app.get("/portfolio/:address", async (request, reply) => {
        const address = request.params.address.toLowerCase();
        const { data: events, error: eventsError } = await supabase_1.supabaseAdmin
            .from("market_events")
            .select("market_id")
            .ilike("account", address);
        if (eventsError) {
            return reply.status(500).send({ error: eventsError.message });
        }
        const marketIds = [...new Set((events ?? []).map((e) => e.market_id))];
        if (marketIds.length === 0) {
            return reply.send({ markets: [] });
        }
        const { data: markets, error: marketsError } = await supabase_1.supabaseAdmin
            .from("markets")
            .select("*")
            .in("id", marketIds);
        if (marketsError) {
            return reply.status(500).send({ error: marketsError.message });
        }
        return reply.send({ markets: markets ?? [] });
    });
}
//# sourceMappingURL=portfolio.js.map