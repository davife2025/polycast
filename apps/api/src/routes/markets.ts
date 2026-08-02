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
}
