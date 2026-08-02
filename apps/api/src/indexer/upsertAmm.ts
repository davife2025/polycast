import { formatUnits } from "viem";
import { polycastAMMAbi } from "@polycast/abi";
import { publicClient } from "../lib/chain";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Called once, when an AMM is first discovered for a market (via
 * AMMCreated), to record its address on the market's row.
 */
export async function setMarketAmmAddress(
  marketAddress: string,
  ammAddress: string,
) {
  const { error } = await supabaseAdmin
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
export async function syncAmmPrice(marketAddress: string, ammAddress: `0x${string}`) {
  const [yesPriceWad] = await publicClient.readContract({
    address: ammAddress,
    abi: polycastAMMAbi,
    functionName: "getPrices",
  });

  // yesPriceWad is 1e18-scaled (e.g. 0.73e18 for 73%). Values at this
  // scale exceed Number.MAX_SAFE_INTEGER, so we format it down to a
  // decimal string first (formatUnits) rather than calling Number()
  // directly on the raw bigint, which would silently lose precision.
  const yesPrice = Number(formatUnits(yesPriceWad, 18));

  const { error } = await supabaseAdmin
    .from("markets")
    .update({ yes_price_cached: yesPrice })
    .eq("chain_market_address", marketAddress);

  if (error) {
    console.error(`Failed to sync AMM price for market ${marketAddress}:`, error);
  }
}
