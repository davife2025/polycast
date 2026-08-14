# Missing UI features — closing all four audit gaps

Scope: `apps/web` (four new/changed frontend pieces), `apps/api` (new
routes + CORS), root env templates.

Directly closes the four items flagged in `PROJECT-AUDIT.md`'s "Missing
entirely" list.

## 1. Tracking market UI (`TrackingPanel.tsx`)

Previously: the entire Polymarket-tracking feature (`PolycastOracleMinter`)
had zero frontend — only reachable via raw contract calls.

Now: a trading panel parallel to `TradingPanel.tsx`, but for the oracle
minter — shows live YES/NO price via `currentPrice()` (including a
"(stale)" flag if the oracle hasn't updated recently), buy/sell forms,
approval flow, and — importantly — **the LP risk disclosure surfaced
directly in the UI**, not just in the contract's code comments:

> "This is not an AMM. Trades happen directly against the quoted price
> above — liquidity providers here are the direct counterparty to every
> trade, not protected by a pricing curve."

Rendered on the market detail page alongside (not instead of)
`TradingPanel`, since a market can have both an AMM and a tracking
minter. Each panel independently shows its own "not deployed for this
market" empty state if that mechanism doesn't exist yet.

## 2. Market-creation UI (`CreateMarketForm.tsx`, `/markets/create`)

Previously: markets could only be created by editing the deploy script.

Now: a form (question, collateral token address, resolver address) that
calls `factory.createMarket()` directly, decodes the `MarketCreated`
event from the transaction receipt via `viem`'s `decodeEventLog`, and
navigates straight to the new market's page — no manual address lookup
needed. Linked from the nav as "Create".

## 3. Portfolio page (`PortfolioList.tsx`, `/portfolio`)

Previously: no way to see your own positions across markets.

Deliberately **not** implemented as "check every market's balance for
this user" — that doesn't scale. Instead: new `GET /portfolio/:address`
route on `apps/api` queries the *already-indexed* `market_events` table
for every market this address has ever touched (a handful of rows, not
every market that exists), then the frontend does a live on-chain
`balanceOf` check only for those specific markets. This is the first
time the frontend actually uses the indexer's data instead of reading
purely from the chain — the indexer work from earlier sessions finally
has a real consumer.

## 4. Activity feed (`ActivityFeed.tsx`)

Previously: `apps/api` had a working `/markets/:id/events` endpoint with
real indexed data, and nothing in the frontend displayed it.

Now: rendered at the bottom of every market detail page — a table of
every mint/merge/settle/redeem/buy/sell/liquidity event, tagged by
source (Market / AMM / Tracking), with a link to the transaction on the
Coston2 explorer. Added a second route,
`GET /markets/by-address/:address/events`, since the frontend only ever
knows a market's on-chain address, not its Supabase row id — avoids
making the frontend do an extra lookup just to find that id first.

## Also: CORS enabled on `apps/api`

This is the first time the frontend calls `apps/api` directly from the
browser (previously it only ever talked to the chain). Added
`@fastify/cors` (exact-pinned, `9.0.1`) with `origin: true` — safe here
specifically because every route behind it is read-only; nothing that
moves money goes through this API, ever.

## New env vars

```
# apps/web/.env.local
NEXT_PUBLIC_ORACLE_MINTER_FACTORY_ADDRESS=
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## What was verified, not just written

- Real `next build` — all four routes (`/`, `/markets/[address]`,
  `/markets/create`, `/portfolio`) compile and prerender successfully.
- Real `tsc --noEmit` on `apps/api` with the new routes and CORS.
- **Booted the actual server and hit both new routes** — confirmed
  `/portfolio/:address` and `/markets/by-address/:address/events` both
  respond with clean, well-formed errors (since this sandbox has no real
  Supabase credentials) rather than crashing, and confirmed `/health`
  still works immediately after, proving the server survives both.
- Confirmed CORS headers are actually present on a live response
  (`access-control-allow-origin` header checked directly via `curl`).
- `npm ci` re-verified clean with the new `@fastify/cors` dependency
  correctly captured in the lockfile.
- All 30 contract tests re-confirmed passing, unaffected by this session
  (no contract changes this time).

## Honest scope notes

- `CreateMarketForm` only supports creating markets with a manually-typed
  resolver address — no UI yet for configuring an `FtsoPriceResolver` or
  `FdcWeb2JsonResolver`'s parameters (those need more structured input
  than a single address). `ManualResolver` is the practical option from
  this form today.
- The portfolio page's balance checks are per-market `useReadContracts`
  calls — fine at current scale, would want batching/multicall
  optimization if a user holds positions across many markets.
- `TrackingPanel`'s slippage protection is still the same permissive
  placeholder noted in earlier sessions for `TradingPanel` — not fixed
  here, carried over as a known gap.
