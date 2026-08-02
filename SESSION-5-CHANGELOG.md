# Session 5 changelog

Scope: `packages/contracts` (new AMM + AMM factory), `packages/abi` (new
ABIs), `apps/web` (real trading UI + live prices).

## New: `PolycastAMM.sol` — real price discovery

Until this session, "trading" meant literally transferring ERC-1155 tokens
between wallets with no price at all. This is a Fixed Product Market Maker
(the same mechanism family as Gnosis's Conditional Tokens market makers,
used by Omen, and by Polymarket in its early days before it moved to an
order book):

- Pool reserves ARE the AMM's own YES/NO balances on `PolycastMarket` —
  read directly via `balanceOf`, no separate reserve bookkeeping to drift
  out of sync.
- `addLiquidity` / `removeLiquidity` — seed or exit the pool.
- `buy(outcome, collateralIn, minTokensOut)` — mints a full pair for the
  trade size, then swaps the unwanted side along the constant-product
  curve for extra shares of the outcome you want.
- `sell(outcome, collateralOut, maxTokensIn)` — you specify the payout you
  want; the contract tells you how many shares that costs. (This direction
  was chosen specifically because it solves linearly — the reverse
  direction requires a quadratic/sqrt, which was deliberately avoided this
  session; see the contract's docstring.)
- `getPrices()` — the actual "73% YES" style number the whole rest of the
  build has been waiting for since Session 1's marketing mockup.

**A real bug was caught and fixed during this session, not after:** the
first version of the buy/sell math used floor division, which — traced
through by hand — rounds slightly in the *trader's* favor on every single
trade (a classic AMM rounding-exploit surface: tiny value leakage,
repeatable indefinitely). Fixed by switching to `Math.ceilDiv` for both
directions, so rounding always favors the pool instead. See the "What was
verified" section below for how this was confirmed, not just asserted.

## New: `PolycastAMMFactory.sol`

Deploys one AMM per market, kept **separate from `PolycastMarketFactory`**
so an AMM stays optional — some markets might use a future order book
instead, or none at all.

## Scope limitations, stated plainly

- **No trading fee (0%).** Every trade is exact-invariant with no skim to
  LPs. Adding a fee is straightforward but was left out to keep the
  correctness-critical buy/sell math as simple as possible to verify.
- **`addLiquidity`'s share-accounting formula is a simplified heuristic**
  (sum-of-reserves), fine for a fresh or lightly-traded pool, but not fully
  sandwich-attack-resistant once a pool has seen real trading activity. A
  more careful design (Uniswap V2-style dual-asset deposits matching the
  current ratio) is flagged as a real follow-up, not silently glossed over.
- `removeLiquidity` returns raw YES/NO tokens proportionally, not
  auto-converted to collateral (since after trading, the two sides are
  rarely equal in value).

## Changed: `packages/abi`, `apps/web`

- `export-abi.js` now also exports `PolycastAMM` and `PolycastAMMFactory`.
- New `components/TradingPanel.tsx` — the actual buy/sell UI: live
  YES/NO price display, buy (with a collateral-approval step), sell (with
  an ERC-1155 `setApprovalForAll` step, explained in the UI), a clear
  "no AMM deployed yet" empty state.
- `components/MarketsList.tsx` — market cards now show a live "72% YES"
  price badge when an AMM exists for that market, instead of only
  collateral-locked.
- `lib/chain.ts` / `lib/contracts.ts` — added `ammFactoryAddress` and
  AMM contract config helpers, same pattern as the market factory.
- `packages/contracts/scripts/deploy.ts` — now also deploys the AMM
  factory, creates a demo AMM for the smoke-test market, and seeds it
  with liquidity so the frontend has a real, non-zero price immediately
  after deploy. Prints all four env vars you need to set afterward.

## What was verified, not just written

This session leaned harder on hand-verification than any previous one,
because AMM math is exactly the kind of thing that looks plausible while
being subtly wrong.

- Every buy/sell test asserts an **exact expected integer**, independently
  derived by hand from the constant-product invariant, not just "some
  reasonable-looking number." Example: a 1000/1000 pool, buy YES with 100
  collateral → hand-derived expected `tokensOut = 190` (via
  `ceilDiv(1,000,000, 1100) = 910`, `1100 - 910 = 190`). The contract
  returned exactly 190.
- Caught the floor-vs-ceiling rounding bug specifically *because* of this
  hand-verification discipline — the first test run returned 191 (not
  190), which is what led to tracing the rounding direction and finding
  the real issue, documented above.
- A dedicated invariant-safety test checks that the pool's product
  (`yesReserve * noReserve`) is never smaller after a trade than before —
  i.e. rounding never leaks value out of the pool.
- A dedicated direction test checks that buying YES actually makes YES
  *more expensive* afterward (not just "some price changed").
- Slippage protection tested on both `buy` (`minTokensOut`) and `sell`
  (`maxTokensIn`), with reverts expected at exactly the boundary implied
  by the hand-derived numbers, not a loose bound.
- The ERC-1155 approval requirement for `sell` is tested explicitly — an
  unapproved sell reverts with `ERC1155MissingApprovalForAll`, confirming
  the AMM doesn't silently allow itself unauthorized transfers.
- Liquidity add/remove tested for proportionality, including a
  second-LP-joins-a-still-balanced-pool case.
- All 17 contract tests passing (9 from Sessions 2-4, 8 new this session),
  run against a real Hardhat Network EVM — actual deployments, actual
  transactions, actual balance/reserve assertions.
- `apps/web` — real `next build`, both routes compile, real
  `tsc --noEmit` (caught and fixed one real type error: `outcome` state
  was `0 | 1` but the contract call needed `bigint`).

## Not yet done (later sessions)

- No trading fee, as noted above.
- The client-side `minTokensOut`/`maxTokensIn` slippage values in
  `TradingPanel.tsx` are currently placeholders (0 and a large ceiling,
  respectively) rather than a computed expected price with a real
  slippage tolerance — flagged directly in the component's code comments.
  A production UI should mirror the contract's formula client-side to
  show "you'll get ~X shares" before the trade and set a real bound.
- `apps/api`'s indexer (Session 4) doesn't yet track AMM events
  (`Bought`/`Sold`/`LiquidityAdded`/`LiquidityRemoved`) into Supabase —
  it only watches the base market's mint/merge/settle/redeem events.
  Extending it to the AMM is a natural next step, and would finally let
  `yes_price_cached` in the schema get populated for real.
