/**
 * Flare Coston2 testnet configuration + wagmi setup.
 *
 * This is the single place chain config lives. When we move to Flare
 * Mainnet, this file (plus env vars) is what changes — application code
 * elsewhere should import from here rather than hardcoding chain details.
 */
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const costonTwo = defineChain({
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: {
    name: "Coston2 Flare",
    symbol: "C2FLR",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_URL ??
          "https://coston2-api.flare.network/ext/C/rpc",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url:
        process.env.NEXT_PUBLIC_EXPLORER_URL ??
        "https://coston2-explorer.flare.network",
    },
  },
  testnet: true,
});

/// The factory contract address once it's deployed via
/// `packages/contracts`'s deploy:coston2 script (see that package's
/// README). Empty until then — components should handle that gracefully
/// rather than assuming it's set.
export const marketFactoryAddress = (process.env
  .NEXT_PUBLIC_MARKET_FACTORY_ADDRESS ?? "") as `0x${string}`;

/// The AMM factory address, once deployed (see packages/contracts). A
/// market can exist without an AMM (pure OTC via mintPair/mergePair) —
/// components should check `ammForMarket(marketAddress)` returning the
/// zero address as "no AMM yet" rather than assuming one exists.
export const ammFactoryAddress = (process.env
  .NEXT_PUBLIC_AMM_FACTORY_ADDRESS ?? "") as `0x${string}`;

export const wagmiConfig = createConfig({
  chains: [costonTwo],
  connectors: [injected()],
  transports: {
    [costonTwo.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

