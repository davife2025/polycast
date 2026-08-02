# Polycast

Interoperable prediction market platform built on Flare Network.

> Prediction markets settled against verified, cross-chain oracle consensus —
> so an outcome asset means the same thing no matter which network it moves through.

## Monorepo layout

```
polycast/
├── apps/
│   ├── web/            Next.js frontend (trading UI, wallet connect, Polycast design system)
│   └── api/             Backend service (chain event indexing, resolver orchestration, REST API)
├── packages/
│   ├── contracts/        Hardhat project — Solidity contracts, deploy scripts, targets Flare Coston2 testnet
│   ├── supabase/          Database schema + migrations (off-chain cache/index of on-chain state)
│   └── ui/                Shared design tokens (color, type) used by apps/web
├── package.json           npm workspaces root
└── turbo.json              Turborepo task pipeline
```

## Why this split

- **On-chain (`packages/contracts`) is the source of truth** for balances, collateral, and settlement.
  Nothing about who owns what or what an outcome resolved to is ever decided off-chain.
- **Supabase is a read-optimized cache**, not a ledger. It exists so the frontend can list markets,
  show trade history, and render fast without hammering the chain with RPC calls for every page load.
  `apps/api` is what keeps Supabase in sync with on-chain events.
- **`apps/web` never talks to Supabase for anything money-related** — trading, minting, and redeeming
  always go directly through the user's wallet to the contracts. Supabase is for *display*, chain is for *truth*.

## Network target (current phase)

Building against **Flare Coston2 testnet**:

| | |
|---|---|
| Chain ID | `114` |
| RPC | `https://coston2-api.flare.network/ext/C/rpc` |
| Explorer | https://coston2-explorer.flare.network |
| Faucet | https://faucet.flare.network/coston2 (get C2FLR, FXRP, USDT0) |

Everything is scaffolded so switching to Flare Mainnet later is a config change
(new RPC + chain ID + real collateral addresses), not a rewrite.

## Build sessions

This repo is being built in sessions. Each session after the first ships as a zip
containing only new/changed files plus a short changelog, so the repo is assembled
incrementally rather than re-delivered whole each time.

| Session | Scope |
|---|---|
| 1 | Infra scaffold (this delivery): monorepo, Next.js app wired to brand tokens, API service skeleton, Hardhat project configured for Coston2, Supabase schema |
| 2 | Core contracts: outcome-share market, resolvers (FTSO + manual fallback), factory, deploy scripts |
| 3 | Wallet connect + frontend reading real on-chain market data on Coston2 |
| 4 | Indexer service in `apps/api`, Supabase sync |
| 5 | Trading UI, portfolio, resolution flow, polish |

## Getting started (once dependencies are installed locally)

```bash
npm install
cp .env.example .env.local   # fill in RPC keys, Supabase keys, etc.
npm run dev                  # runs apps/web and apps/api in parallel via turbo
```

To work on contracts specifically:

```bash
cd packages/contracts
cp .env.example .env         # set PRIVATE_KEY (a Coston2 testnet key, funded via faucet)
npm run compile
npm run deploy:coston2
```
