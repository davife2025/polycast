import type { WalletClient, Account, Chain, Transport } from "viem";
import { polymarketPriceOracleAbi } from "@polycast/abi";

/**
 * Pushes a single price update on-chain. Deliberately factored out from
 * both the Polymarket-fetching logic (polymarket.ts) and the polling
 * loop (index.ts) so this piece — the part that actually matters for
 * on-chain correctness — can be tested against a real local chain
 * without needing to reach Polymarket's API at all. See
 * test/relayer-push.test.ts.
 */
export async function pushPriceOnChain(
  walletClient: WalletClient<Transport, Chain, Account>,
  oracleAddress: `0x${string}`,
  oracleMarketId: `0x${string}`,
  yesPriceWad: bigint,
): Promise<`0x${string}`> {
  return walletClient.writeContract({
    address: oracleAddress,
    abi: polymarketPriceOracleAbi,
    functionName: "updatePrice",
    args: [oracleMarketId, yesPriceWad],
  });
}
