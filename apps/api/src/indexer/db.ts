import { supabaseAdmin } from "../lib/supabase";

/**
 * Looks up a market's Supabase row id by its on-chain address. Shared by
 * watchMarket.ts and watchAMM.ts so there's one place that knows how
 * markets are keyed, rather than each event watcher re-implementing the
 * same lookup.
 */
export async function getMarketRowId(marketAddress: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
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
