# Setup guide

This walks through getting real values into every env file, in the order
you actually need them. None of these can be filled in for you — they all
come from accounts only you control (a Supabase project, a wallet you
hold the key to). Where a secret is involved, the note below says so
explicitly: **never share a service role key or private key in chat, a
support ticket, or a public repo — only ever paste them directly into
your own local `.env` files.**

## 1. Supabase (database)

1. Go to [supabase.com](https://supabase.com), sign in, and create a new project.
2. Once it's provisioned, open **Project Settings → API**. You'll need three things from this page:
   - **Project URL** — looks like `https://xxxxx.supabase.co`
   - **anon / public key** — safe to expose in the browser (protected by Row Level Security)
   - **service_role key** — ⚠️ **secret**, bypasses Row Level Security entirely. Only ever goes in `apps/api/.env`, never `apps/web`.
3. Open the **SQL Editor** in the Supabase dashboard, paste in the contents of `packages/supabase/schema.sql`, and run it. This creates all the tables (`markets`, `market_events`, `trades`, `resolutions`, `wallets`) and their Row Level Security policies.
4. Fill in:
   - `apps/web/.env.local` (copy from `apps/web/.env.local.example`):
     ```
     NEXT_PUBLIC_SUPABASE_URL=<project URL>
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
     ```
   - `apps/api/.env` (copy from `apps/api/.env.example`):
     ```
     SUPABASE_URL=<project URL>
     SUPABASE_SERVICE_ROLE_KEY=<service_role key>
     ```

## 2. A testnet wallet (for deploying contracts)

Use a **fresh wallet you create specifically for this**, not one holding
any real funds on any network. Testnet keys still shouldn't be reused
elsewhere — treat it as disposable.

1. Create a new account in MetaMask (or any wallet), or generate one with a CLI tool (e.g. `cast wallet new` if you have Foundry installed).
2. Copy its private key (MetaMask: account menu → Account details → Show private key).
3. Add the Flare Coston2 network to your wallet if it's not already there:
   - Network name: `Flare Testnet Coston2`
   - RPC URL: `https://coston2-api.flare.network/ext/C/rpc`
   - Chain ID: `114`
   - Currency symbol: `C2FLR`
   - Block explorer: `https://coston2-explorer.flare.network`
4. Fund it at the faucet: [faucet.flare.network/coston2](https://faucet.flare.network/coston2) — request C2FLR (you'll need a small amount for gas to deploy).
5. Fill in `packages/contracts/.env` (copy from `packages/contracts/.env.example`):
   ```
   PRIVATE_KEY=<your testnet wallet's private key>
   ```

## 3. Deploy the contracts

This is also the step that fills in every remaining address in every
other env file, so do it after steps 1-2, not before.

```bash
cd packages/contracts
npm install
npm run compile
npm run deploy:coston2
```

The script prints every address you need, including a ready-to-paste
block at the end:

```
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_AMM_FACTORY_ADDRESS=0x...
MARKET_FACTORY_ADDRESS=0x...
AMM_FACTORY_ADDRESS=0x...
```

Copy the `NEXT_PUBLIC_*` lines into `apps/web/.env.local`, and the plain
ones into `apps/api/.env`.

It also prints the `ManualResolver` address it deployed. Add that to
`apps/api/.env`'s `RESOLVER_TYPE_MAP` so the indexer knows what kind of
resolver it is (see `apps/api/src/indexer/resolverType.ts` for why this
mapping exists rather than being automatic):

```
RESOLVER_TYPE_MAP={"0xTheManualResolverAddressPrintedAbove":"manual"}
```

## 4. Run everything

```bash
# from the repo root
npm install
npm run dev
```

This runs `apps/web` (Next.js, default port 3000) and `apps/api`
(Fastify, default port 4000, or whatever `PORT` you set) in parallel via
Turborepo. Visit `http://localhost:3000` — you should see the demo market
the deploy script created, already seeded with AMM liquidity at a 50/50
price.

## Quick reference: which file goes where

| File | Copy from | Contains |
|---|---|---|
| `apps/web/.env.local` | `apps/web/.env.local.example` | Supabase public keys, contract addresses, RPC config |
| `apps/api/.env` | `apps/api/.env.example` | Supabase service role key, contract addresses, resolver map |
| `packages/contracts/.env` | `packages/contracts/.env.example` | Your testnet wallet's private key |

The root `.env.example` is a reference showing all of these in one place
for convenience — it isn't read by anything directly.
