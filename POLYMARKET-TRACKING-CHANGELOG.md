# Polymarket tracking market changelog

Scope: new `PolymarketPriceOracle.sol` and `PolycastOracleMinter.sol`
contracts, a real off-chain relayer in `apps/api`, and 11 new hand-verified
tests.

## What this builds

Your idea: continuously track Polymarket's live odds as the real-time
tradeable price on Polycast. This is architecturally distinct from
`PolycastAMM.sol` — it's a synthetic minter (closer in spirit to how
Synthetix mints synthetic exposure at an oracle price) rather than an
AMM with its own price discovery.

- **`PolymarketPriceOracle.sol`** — a push oracle. A trusted relayer
  address writes the current YES probability for a given market; reads
  are public. Includes an `isFresh()` staleness check so trades can't
  execute against a frozen price if the relayer goes down.
- **`PolycastOracleMinter.sol`** — buy/sell YES/NO directly at the
  oracle's current price. To sell a trader `tokensOut` of YES at price
  P, it mints `tokensOut` worth of a full pair (funded by the trader's
  payment plus a pool subsidy, since P < 100% means tokensOut > payment),
  gives the trader the YES side, and keeps the NO side as pool inventory.
  Selling recycles matched inventory back into collateral via `mergePair`
  where possible.
- **`PolycastOracleMinterFactory.sol`** — deploys minters per market,
  mirroring `PolycastAMMFactory`'s pattern (a market can have an AMM, a
  tracking minter, both, or neither).
- **The relayer** (`apps/api/src/relayer/`) — polls Polymarket's real
  CLOB API (`https://clob.polymarket.com/midpoint?token_id=X`) and
  pushes prices on-chain. Split into `polymarket.ts` (the API fetch) and
  `pushPrice.ts` (the on-chain write), specifically so the two could be
  tested independently — see verification section below.

## The risk disclosure — read this before deploying

This is a genuinely different, higher-risk model than `PolycastAMM.sol`,
and the contract's own docstring says so prominently, not just this
changelog: **LPs here are the direct counterparty to every trade, at a
price they don't control.** In the AMM, an LP's worst case is bounded by
the constant-product curve itself. Here, if trading flow is one-sided
(e.g. everyone buys YES because Polymarket shows 90%), the pool
accumulates NO inventory that becomes worthless if YES resolves true.
That's much closer to bookmaker risk than AMM LPing. A serious
deployment would want LPs (or the protocol) actively hedging net
exposure — e.g. trading the offsetting side on Polymarket itself to stay
flat — which this contract does not do for you. Worth noting: that
hedging need is essentially the "arbitrage bot" option you didn't pick
becoming necessary infrastructure for the option you did pick — they're
complementary, not alternatives.

## A deliberate trust tradeoff, also disclosed directly in the code

The live price comes from a single relayer address — not trustless the
way FTSO or FDC are elsewhere in this product. That's a conscious
speed-for-trust tradeoff: Polymarket's odds move continuously, and FDC's
attestation voting round isn't fast enough to track that live. Per your
answer, **final settlement of a tracking market should still go through
`FdcWeb2JsonResolver`** (already built, in an earlier session) rather
than trusting the relayer's word for the final outcome too — register
the market's resolution against Polymarket's own Data API result, same
pattern already used for other real-world event markets. No new
resolver code was needed for this; the existing generic
`FdcWeb2JsonResolver` already covers it.

## What was verified, not just written

- All 11 new tests pass with **exact hand-derived values**: e.g. buying
  YES at a 70% oracle price with 100,000 collateral hand-calculates to
  exactly 142,857 tokens (`floor(100,000 × 1e18 / 0.7e18)`), with the
  pool correctly subsidizing the 42,857 gap and receiving 142,857 NO as
  inventory. The contract returned exactly those numbers.
- Staleness protection tested directly: fast-forwarded the test chain's
  clock past `MAX_PRICE_AGE_SECONDS` and confirmed trades correctly
  revert with `"oracle price is stale"`.
- **Actually verified the real Polymarket API shape** before writing the
  relayer, rather than guessing: confirmed via Polymarket's current
  official documentation and client library source that
  `GET https://clob.polymarket.com/midpoint?token_id=X` returns
  `{"mid_price": "0.45"}`, unauthenticated.
- **Tested the on-chain-pushing half for real**, independent of whether
  Polymarket itself is reachable: `apps/api/verify-relayer-push.ts`
  deploys the actual compiled `PolymarketPriceOracle` to a live local
  chain and calls the actual `pushPriceOnChain()` function (not a
  re-implementation) — confirmed the value written matches exactly what
  was read back. Kept as a permanent tool, not thrown away after use.
- Tested the relayer's failure handling for real: hit Polymarket's real
  CLOB endpoint from this sandbox and got back
  `"Host not in allowlist: clob.polymarket.com"` — confirming this
  sandbox's own network restriction, not a Polymarket-side block (same
  restriction class as Coston2's RPC and the Solidity compiler host
  throughout this build). Confirmed the relayer logs the failure clearly
  per-market and keeps polling on schedule rather than crashing — the
  same fail-gracefully pattern as the rest of `apps/api`.
- All 29 contract tests (18 previous + 11 new) passing together.

## What genuinely could not be verified here

The Polymarket fetch itself (`fetchMidpointPrice`) has not run against
the live API — this sandbox can't reach it. The URL and response shape
are confirmed accurate from documentation, but the function itself
needs a real test from an environment with normal internet access
before you trust it in production.

## Env vars needed (added to `apps/api/.env.example`)

```
PRICE_ORACLE_ADDRESS=       # deployed PolymarketPriceOracle address
RELAYER_PRIVATE_KEY=        # wallet set as that oracle's relayer — testnet-only key
RELAYER_POLL_INTERVAL_MS=15000
TRACKING_MARKETS=[]         # JSON array: [{"oracleMarketId","polymarketTokenId","label"}]
```
