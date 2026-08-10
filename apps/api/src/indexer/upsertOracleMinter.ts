import { formatUnits } from "viem";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Called once when an oracle minter is first discovered (via
 * OracleMinterCreated), to record its address plus which oracle/marketId
 * it reads from.
 */
export async function setMarketOracleMinterAddress(params: {
  marketAddress: string;
  minterAddress: string;
  oracleAddress: string;
  oracleMarketId: string;
}) {
  const { error } = await supabaseAdmin
    .from("markets")
    .update({
      oracle_minter_address: params.minterAddress,
      price_oracle_address: params.oracleAddress,
      oracle_market_id: params.oracleMarketId,
    })
    .eq("chain_market_address", params.marketAddress);

  if (error) {
    console.error(
      `Failed to set oracle minter info for market ${params.marketAddress}:`,
      error,
    );
  }
}

/**
 * Updates yes_price_cached for every market registered against a given
 * (oracleAddress, oracleMarketId) pair — usually just one market, but
 * handled as a list since nothing stops two markets from tracking the
 * same external question.
 */
export async function syncOraclePriceForMarkets(
  oracleAddress: string,
  oracleMarketId: string,
  yesPriceWad: bigint,
) {
  const yesPrice = Number(formatUnits(yesPriceWad, 18));

  const { error } = await supabaseAdmin
    .from("markets")
    .update({ yes_price_cached: yesPrice })
    .eq("price_oracle_address", oracleAddress)
    .eq("oracle_market_id", oracleMarketId);

  if (error) {
    console.error(
      `Failed to sync oracle price for oracleMarketId ${oracleMarketId}:`,
      error,
    );
  }
}
