import { formatUnits } from "viem";
import { polycastMarketAbi } from "@polycast/abi";
import { publicClient } from "../lib/chain";
import { supabaseAdmin } from "../lib/supabase";
import { getTokenSymbol } from "./erc20";
import { getResolverType } from "./resolverType";

/**
 * Called once when a market is first discovered (via MarketCreated),
 * to create its row in Supabase before any trading activity happens.
 */
export async function upsertNewMarket(params: {
  marketAddress: `0x${string}`;
  question: string;
  collateralToken: `0x${string}`;
  resolverAddress: `0x${string}`;
}) {
  const { marketAddress, question, collateralToken, resolverAddress } = params;
  const collateralSymbol = await getTokenSymbol(collateralToken);
  const resolverType = getResolverType(resolverAddress);

  const { error } = await supabaseAdmin.from("markets").upsert(
    {
      chain_market_address: marketAddress,
      question,
      collateral_token_address: collateralToken,
      collateral_symbol: collateralSymbol,
      resolver_address: resolverAddress,
      resolver_type: resolverType,
      status: "open",
    },
    { onConflict: "chain_market_address" },
  );

  if (error) {
    console.error(`Failed to upsert new market ${marketAddress}:`, error);
  } else {
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
export async function syncMarketState(marketAddress: `0x${string}`) {
  const market = { address: marketAddress, abi: polycastMarketAbi } as const;

  const [totalCollateral, settled, outcome] = await Promise.all([
    publicClient.readContract({ ...market, functionName: "totalCollateral" }),
    publicClient.readContract({ ...market, functionName: "settled" }),
    publicClient.readContract({ ...market, functionName: "outcome" }),
  ]);

  const { error } = await supabaseAdmin
    .from("markets")
    .update({
      // MVP proxy for "volume" until a real order book/AMM exists (Session 5) —
      // see the comment on this column in packages/supabase/schema.sql.
      volume_cached: formatUnits(totalCollateral as bigint, 18),
      status: settled ? "resolved" : "open",
      resolved_outcome: settled ? Number(outcome) : null,
      resolved_at: settled ? new Date().toISOString() : null,
    })
    .eq("chain_market_address", marketAddress);

  if (error) {
    console.error(`Failed to sync market state for ${marketAddress}:`, error);
  }
}