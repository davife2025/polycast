import type { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../lib/supabase";

export async function marketsRoutes(app: FastifyInstance) {
  // GET /markets — list markets from the Supabase cache (fast reads for the UI).
  // Session 4 wires this up to real data synced from on-chain events.
  app.get("/markets", async (_request, reply) => {
    const { data, error } = await supabaseAdmin
      .from("markets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ markets: data ?? [] });
  });

  // GET /markets/:id — single market detail.
  app.get<{ Params: { id: string } }>("/markets/:id", async (request, reply) => {
    const { id } = request.params;
    const { data, error } = await supabaseAdmin
      .from("markets")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return reply.status(404).send({ error: "Market not found" });
    }

    return reply.send({ market: data });
  });

  // GET /markets/:id/events — raw on-chain activity (mint/merge/settle/redeem),
  // populated by the indexer. See packages/supabase/schema.sql for why this
  // is separate from the (currently unused) `trades` table.
  app.get<{ Params: { id: string } }>(
    "/markets/:id/events",
    async (request, reply) => {
      const { id } = request.params;
      const { data, error } = await supabaseAdmin
        .from("market_events")
        .select("*")
        .eq("market_id", id)
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ events: data ?? [] });
    },
  );

  // GET /markets/by-address/:address/events — same as above, but keyed
  // by the on-chain contract address instead of the Supabase row id.
  // The frontend only ever knows the on-chain address, so this avoids
  // making it do a separate lookup first just to find the row id.
  app.get<{ Params: { address: string } }>(
    "/markets/by-address/:address/events",
    async (request, reply) => {
      const address = request.params.address.toLowerCase();

      const { data: market, error: marketError } = await supabaseAdmin
        .from("markets")
        .select("id")
        .ilike("chain_market_address", address)
        .single();

      if (marketError || !market) {
        return reply.status(404).send({ error: "Market not found" });
      }

      const { data, error } = await supabaseAdmin
        .from("market_events")
        .select("*")
        .eq("market_id", market.id)
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ events: data ?? [] });
    },
  );
}
