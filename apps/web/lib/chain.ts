/**
 * Flare Coston2 testnet configuration.
 *
 * This is the single place chain config lives. When we move to Flare
 * Mainnet, this file (plus env vars) is what changes — application code
 * elsewhere should import from here rather than hardcoding chain details.
 *
 * Wallet connection (wagmi/viem) gets wired up against this in Session 3.
 */

export const costonTwo = {
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
} as const;

export const marketFactoryAddress = (process.env
  .NEXT_PUBLIC_MARKET_FACTORY_ADDRESS ?? "") as `0x${string}`;
