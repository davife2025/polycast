# Polycast

**Interoperable prediction markets, settled against verifiable on-chain and cross-chain data — built on Flare Network.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Network: Flare Coston2](https://img.shields.io/badge/network-Flare%20Coston2-e62058.svg)](https://coston2-explorer.flare.network)

Polycast is a prediction market protocol where an outcome share means the
same thing regardless of which data source, chain, or oracle produced the
result. Markets settle against real price feeds, real-world events verified
through cryptographic attestation, or a manual fallback — never against a
single trusted party's word alone unless the market explicitly chooses that
tradeoff.

---

## Table of contents

- [Why Polycast](#why-polycast)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Network](#network)
- [Security notes](#security-notes)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why Polycast

Existing prediction market platforms resolve outcomes one of two ways:
a centralized operator posts the result, or a decentralized dispute game
(propose → challenge window → arbitration) eventually converges on one.
Both work, but both put a human in the critical path of every settlement.

Polycast asks a narrower question: **for markets where the answer is
already a verifiable, structured fact somewhere on the internet — an
asset's price, a game's final score, an election call — can settlement
skip the human entirely?**

Flare Network is purpose-built for exactly this: FTSO gives it native,
decentralized price feeds, and FDC (the Flare Data Connector) lets any
contract request a cryptographically attested proof of an arbitrary Web2
JSON API response. Polycast is the prediction market layer on top of that
primitive.

## How it works

Every Polycast market is a simple, auditable primitive:

1. **Deposit collateral, mint a full pair.** 1 unit of collateral always
   mints exactly 1 YES share + 1 NO share (ERC-1155 tokens). This is the
   same design as Gnosis's Conditional Tokens Framework — the mechanism
   Polymarket itself is built on.
2. **Trade.** Shares can be bought and sold through a constant-product AMM
   (`PolycastAMM`), or, for markets tracking an external venue's live odds,
   against a continuously-updated reference price (`PolycastOracleMinter`).
3. **Resolve.** A market's resolver is fixed at creation and is one of:
   - **`FtsoPriceResolver`** — trustless, automatic settlement against
     Flare's native FTSOv2 feeds (e.g. "will BTC be above $X at time T").
   - **`FdcWeb2JsonResolver`** — trustless settlement against a Flare Data
     Connector–attested Web2 API response, for real-world events with no
     native on-chain feed (sports results, election calls, etc.).
   - **`ManualResolver`** — an owner-posted fallback for markets with no
     clean verifiable data source yet.
4. **Redeem.** After resolution, the winning share redeems 1:1 for
   collateral; the losing share redeems for nothing. Shares can also be
   merged back into collateral at any time before resolution.

The chain is always the source of truth for balances, collateral, and
settlement. An off-chain indexer mirrors on-chain events into a read
cache purely so the frontend can list and search markets quickly — it is
never in the path of anything that moves funds.

## Architecture

```
                    ┌──────────────────────┐
                    │   apps/web (Next.js) │  trading UI, wallet connect
                    └──────────┬───────────┘
                               │ reads (display only)     writes (direct)
                               ▼                              │
                    ┌──────────────────────┐                  │
                    │  apps/api (Fastify)  │                  │
                    │  event indexer +     │                  │
                    │  read API            │                  │
                    └──────────┬───────────┘                  │
                               │ mirrors                       │
                               ▼                                ▼
                    ┌──────────────────┐          ┌───────────────────────┐
                    │  Supabase (cache) │          │  Flare Coston2 chain  │
                    └───────────────────┘          │  (source of truth)    │
                                                    │                       │
                                                    │  PolycastMarketFactory│
                                                    │  PolycastMarket (x N) │
                                                    │  PolycastAMM          │
                                                    │  Resolvers (FTSO/FDC/ │
                                                    │  Manual)              │
                                                    └───────────────────────┘
```

**Design principle:** on-chain is truth, the indexer/cache is for display
only, and the frontend never routes money through the backend — every
trade, mint, merge, and redemption goes straight from the user's wallet to
the contracts.

## Repository layout

```
polycast/
├── apps/
│   ├── web/          Next.js frontend — trading UI, wallet connect, market creation
│   └── api/           Fastify backend — chain event indexer, read API, resolver orchestration
├── packages/
│   ├── contracts/      Hardhat project — Solidity contracts + deploy scripts (Flare Coston2)
│   ├── supabase/        Database schema + migrations (read cache of on-chain state)
│   ├── abi/              Generated contract ABIs/types, shared by apps/web and apps/api
│   └── ui/                Shared design tokens (color, type) used by apps/web
├── package.json           npm workspaces root
└── turbo.json              Turborepo task pipeline
```

## Tech stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.25, OpenZeppelin, Hardhat |
| Oracles / attestation | Flare FTSOv2, Flare Data Connector (FDC) Web2Json |
| Chain client | viem |
| Frontend | Next.js 14, React 18, wagmi, Tailwind |
| Backend | Fastify, Node.js |
| Data cache | Supabase (Postgres) |
| Monorepo tooling | npm workspaces, Turborepo, TypeScript |

## Getting started

Full walkthrough — provisioning Supabase, creating a testnet wallet,
deploying contracts, and filling in each app's env file — is in
**[SETUP.md](./SETUP.md)**.

Quick version, once every env file from `SETUP.md` is filled in:

```bash
npm install
npm run dev   # runs apps/web and apps/api in parallel via turbo
```

`apps/web` and `apps/api` each read their own `.env.local` / `.env` from
their own directory, not from the repo root.

## Network

Currently targeting **Flare Coston2 testnet**:

| | |
|---|---|
| Chain ID | `114` |
| RPC | `https://coston2-api.flare.network/ext/C/rpc` |
| Explorer | https://coston2-explorer.flare.network |
| Faucet | https://faucet.flare.network/coston2 (get C2FLR, FXRP, USDT0) |

Moving to Flare Mainnet is a configuration change (RPC URL, chain ID, live
collateral addresses), not a rewrite — application code never hardcodes
chain details outside `lib/chain.ts`.

## Security notes

- Contracts are unaudited. Do not deploy real value against them without
  an independent audit.
- `PolymarketPriceOracle` is an explicitly-disclosed trust assumption: it
  is a push oracle fed by an off-chain relayer, used to drive a *live
  tradeable price*, not final settlement. Final settlement for tracking
  markets should route through `FdcWeb2JsonResolver`, not this oracle.
- `ManualResolver` has no dispute window yet — it exists so every market
  type has a working resolution path while the trustless resolvers mature.


## License

MIT — see [LICENSE](./LICENSE).