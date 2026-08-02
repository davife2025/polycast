import { erc20Abi } from "@polycast/abi";
import { publicClient } from "../lib/chain";

const symbolCache = new Map<string, string>();

/**
 * Reads and caches an ERC-20 token's symbol. Used to populate
 * markets.collateral_symbol without needing the frontend to know about
 * every collateral token in advance.
 */
export async function getTokenSymbol(tokenAddress: `0x${string}`): Promise<string> {
  const cached = symbolCache.get(tokenAddress);
  if (cached) return cached;

  try {
    const symbol = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    });
    symbolCache.set(tokenAddress, symbol);
    return symbol;
  } catch (err) {
    console.warn(`Could not read symbol() for token ${tokenAddress}:`, err);
    return "UNKNOWN";
  }
}
