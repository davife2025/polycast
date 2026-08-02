import { createPublicClient, http, type Chain } from "viem";

export const costonTwo: Chain = {
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc",
      ],
    },
  },
  testnet: true,
};

/**
 * Read-only client used by the indexer (Session 4) to watch for
 * market events (MarketCreated, SharesMinted, MarketResolved, etc.)
 * and mirror them into Supabase.
 */
export const publicClient = createPublicClient({
  chain: costonTwo,
  transport: http(),
});
