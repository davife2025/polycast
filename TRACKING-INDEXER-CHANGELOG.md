# Tracking-market indexer extension changelog

Scope: `packages/contracts` (one small view addition), `apps/api`
(indexer extended to oracle minters/price oracle), `packages/supabase`
(schema update).

## Small contract addition: `PolycastOracleMinter.currentPrice()`

Added a public view wrapper around the internal price lookup, for
frontends/indexers to read the current price without needing to know
about the underlying `PolymarketPriceOracle` directly. Unlike the
internal version `buy`/`sell` use (which reverts on a stale price),
this one **never reverts on staleness** — it returns the last-known
price plus a `fresh` boolean, so a UI can show "73% (stale)" instead of
just failing to load. Added a dedicated test confirming both the fresh
and stale-but-not-reverting cases. **30/30 tests now passing** (was 29).

## Indexer: oracle minters and live prices, same pattern as the AMM

- `watchOracleMinterFactory.ts` — backfills existing minters, watches
  for new ones, mirrors `watchFactory.ts`/`watchAMMFactory.ts` exactly.
- `watchOracleMinter.ts` — records `Bought`/`Sold`/`LiquidityAdded`/
  `LiquidityRemoved` into `market_events`, tagged `source: 'oracle_minter'`.
- `watchPriceOracle.ts` — **new pattern, not copied from the AMM**:
  watches the price oracle's own `PriceUpdated` events directly, so
  `yes_price_cached` stays fresh continuously as the relayer polls
  Polymarket (every ~15s), independent of whether anyone happens to be
  trading at that moment. The AMM's price only needed to update on
  trades because that's the only thing that moves it; a tracking
  market's price moves on its own, so it needed its own watcher.
- `upsertOracleMinter.ts` — `setMarketOracleMinterAddress` (discovery)
  and `syncOraclePriceForMarkets` (called from the price watcher above).
- `index.ts` — `startIndexer()` now starts four independent watchers
  (market, AMM, oracle minter, price oracle), each gated on its own env
  var, each wrapped in its own try/catch.

## Schema changes

- `markets` — added `oracle_minter_address`, `price_oracle_address`,
  `oracle_market_id` (all nullable — a market might have an AMM, a
  tracking minter, both, or neither).
- `market_events` — added a `source` column (`'market' | 'amm' |
  'oracle_minter'`) so activity from different mechanisms on the same
  market can be told apart. Retrofitted onto the existing base-market
  and AMM watchers too (`watchMarket.ts` now tags `'market'`,
  `watchAMM.ts` now tags `'amm'`), not just the new oracle-minter one.

## New env var

```
ORACLE_MINTER_FACTORY_ADDRESS=
```
(`PRICE_ORACLE_ADDRESS` was already added for the relayer in the
previous session — the indexer's price watcher reuses that same value,
since it's watching the same oracle the relayer writes to.)

## What was verified, not just written

- `apps/api` passes `tsc --noEmit` with all the new indexer code.
- All 30 contract tests still passing, unaffected by this session.
- **Booted the server with all four factory/oracle addresses configured
  at once** (market, AMM, oracle minter, price oracle) — confirmed each
  of the four watchers fails independently on this sandbox's known RPC
  restriction, each logs its own distinct error, and the server stays
  up throughout.
- **Specifically re-tested `watchPriceOracle` over a longer 15-second
  window**, since — unlike the three factory watchers — it doesn't do
  an initial backfill call, so its failure mode (background polling
  errors inside `viem`'s `watchContractEvent`) needed separate
  confirmation. Server survived the full window; `viem`'s internal
  polling retries don't crash the process on repeated failures.

## Not yet done

- No frontend UI for tracking markets yet (a `TrackingPanel` parallel to
  `TradingPanel`, showing the live oracle price and buy/sell against the
  minter) — natural next step.
- The relayer's actual Polymarket fetch is still unverified against the
  live API (unchanged limitation from last session).
