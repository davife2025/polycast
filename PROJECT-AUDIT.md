# Polycast — Project Status Audit

_Prepared as a full review of everything built so far, what's verified vs. assumed, and what's genuinely missing before this could handle real users or real money._

---

## 1. Architecture snapshot

```
polycast/
├── apps/
│   ├── web/        Next.js 14 frontend — wallet connect, market list, trading UI
│   └── api/         Fastify backend — REST routes, on-chain indexer, Polymarket relayer
├── packages/
│   ├── contracts/    Hardhat — 13 Solidity contracts, 30 tests
│   ├── abi/           Shared contract ABIs (auto-generated, checked into source)
│   ├── ui/             Design tokens (single source of truth for the brand)
│   └── supabase/       Database schema (read cache, not source of truth)
```

Chain is the source of truth for money and ownership. Supabase is a read-optimized cache the indexer keeps in sync. This separation has held throughout.

---

## 2. Smart contracts — what exists, what's verified

| Contract | Purpose | Verification status |
|---|---|---|
| `PolycastMarket.sol` | ERC-1155 outcome shares: mint/merge/settle/redeem | ✅ Real Hardhat Network tests |
| `PolycastMarketFactory.sol` | Deploys markets, prevents ID collisions | ✅ Tested |
| `ManualResolver.sol` | Admin-posts-the-answer fallback | ✅ Tested |
| `FtsoPriceResolver.sol` | Resolves crypto-price markets via Flare's FTSOv2 | ⚠️ Compiles against real Flare interfaces; **never dynamically tested** — needs the `ContractRegistry` precompile, which only exists on real Flare networks |
| `FdcWeb2JsonResolver.sol` | Resolves real-world markets via verified Web2 API attestation | ⚠️ Same as above — compile-verified only |
| `PolycastAMM.sol` | Fixed Product Market Maker for price discovery | ✅ Tested — **a real rounding-exploit bug was found and fixed** (floor vs. ceiling division; see §5) |
| `PolycastAMMFactory.sol` | Deploys one AMM per market | ✅ Tested |
| `PolymarketPriceOracle.sol` | Push oracle for Polymarket's live odds | ✅ Tested |
| `PolycastOracleMinter.sol` | Trade directly at the oracle's quoted price | ✅ Tested — **real, disclosed LP risk** (see §6) |
| `PolycastOracleMinterFactory.sol` | Deploys one minter per market | ✅ Tested |
| `MockERC20.sol` | Test-only collateral | Test-only, never for production |

**30/30 tests passing**, run against a real Hardhat Network EVM — actual deployments, actual token transfers, actual balance/revert assertions, not mocked.

**The one thing that has never happened: an actual deployment to Coston2.** Every verification above is local (Hardhat Network) or compile-only. The deploy script itself was dry-run end-to-end against a local network and works, but nothing has touched the real testnet yet.

---

## 3. Frontend — what exists, what's missing

**Built:**
- Wallet connect (wagmi/viem, Coston2), with wrong-network detection
- Live market list reading real on-chain data, with AMM price badges
- Market detail page: mint/merge/settle/redeem
- `TradingPanel.tsx` — AMM buy/sell with client-side slippage math mirroring the actual contract formula
- Real error handling: failed/rejected transactions now show a clear message (this was a genuine gap, fixed after your bug report)
- Shared `StatusBadge` component

**Missing entirely:**
- ❌ **No UI for tracking markets** (`PolycastOracleMinter`) — the whole Polymarket-tracking feature has zero frontend. You can only interact with it via raw contract calls right now.
- ❌ **No market-creation UI** — markets can only be created via the deploy script or a direct contract call. There's no "create a market" flow anywhere in the app.
- ❌ **No portfolio page** — no way for a user to see their own positions across markets.
- ❌ **No activity feed UI** — `apps/api` has a `/markets/:id/events` endpoint with real data, but nothing in the frontend displays it.

---

## 4. Backend / indexer — what exists, what's missing

**Built:** full event coverage for markets, AMMs, oracle minters, and the price oracle itself, each independently fail-gracefully. Polymarket relayer polls the real CLOB API and pushes on-chain.

**Missing / weak points:**
- The `RESOLVER_TYPE_MAP` mechanism (mapping a resolver address to its type) is a manual, hand-maintained env var — fragile. The better fix (resolvers exposing their own `resolverType()` view) was noted early on and never done.
- The indexer's backfill always scans from block 0 — fine for a fresh testnet, but will get slow as real chain history accumulates. No checkpointing exists.
- No tests exist for `apps/api` itself — every verification of the indexer/relayer so far has been manual boot-tests (real, but not automated/repeatable the way the contract test suite is).
- No rate limiting or abuse protection on the REST routes.
- No monitoring/alerting if the indexer or relayer silently stalls.

---

## 5. Real bugs caught and fixed along the way

Worth listing explicitly, since catching these was the point of the verification discipline:

1. **AMM rounding-direction bug** — floor division in `buy()`/`sell()` rounded slightly in the trader's favor on every trade, a genuine value-leakage exploit surface. Caught by hand-verifying expected output against the contract's actual output (191 vs. hand-calculated 190). Fixed with `Math.ceilDiv`.
2. **Indexer precision bug** — converting a 1e18-scaled price via `Number(bigint)` directly, which silently loses precision above `Number.MAX_SAFE_INTEGER`. Fixed by routing through `viem`'s `formatUnits` first.
3. **`apps/api` never loaded `.env` files at all** — no `dotenv` import anywhere. Would have silently ignored any environment configuration.
4. **Supabase client crashed the entire server** if unconfigured, rather than failing gracefully — inconsistent with the rest of the app's resilience design.
5. **No lockfile shipped**, ever, until well into the build. This caused real, serious damage: your local install drifted to Hardhat 3.x, Next.js 16, and mismatched files across sessions, costing significant back-and-forth to diagnose and fix.
6. **`solc` installed via `--no-save`**, never persisted to `package.json` — broke the moment you ran a clean `npm ci`.
7. **Files from different sessions became internally inconsistent** on your machine — `PolycastMarket.sol` mismatched with a newer `PolycastAMM.sol`; `lib/chain.ts` missing an export a newer component needed.
8. **UI dead-clicks** — fake nav links, and (more importantly) zero visible feedback when a transaction failed or was rejected, which is functionally indistinguishable from "nothing works."

Items 5–7 in particular point to a process gap, not just isolated bugs: **shipping incremental zips without a lockfile or a way to verify the whole tree stayed consistent was the root cause of most of your debugging pain.** That's fixed now (exact-pinned versions everywhere, a real lockfile), but it's worth naming directly rather than treating each incident as unrelated.

---

## 6. Open risks, stated plainly

- **`PolycastOracleMinter` LPs are direct counterparty risk-takers**, not protected by a pricing curve the way AMM LPs are. If trading flow is one-sided, LPs can take real, uncapped-in-practice losses. No hedging mechanism exists. This is disclosed in the contract's own docstring, but it's a real product risk, not just a documentation note.
- **`PolycastAMM`'s buy fee (2%) has no matching sell fee** — asymmetric, disclosed but unresolved.
- **AMM LP deposits aren't fully sandwich-attack-resistant** — single-asset-in deposits shift the pool ratio; a proper fix needs dual-asset, ratio-matched deposits (Uniswap V2 style), not yet built.
- **The Polymarket relayer's actual API fetch has never run against the live API** — this sandbox can't reach `polymarket.com`. URL/response shape confirmed from documentation, not from a live call.
- **No smart contract security audit** of any kind. Everything here is "verified against my own hand-derived expected values," which catches a lot but is not a substitute for an independent audit before real funds are at stake.
- **Legal/ToS**: Polymarket's main API looks genuinely open for this kind of use per their current docs, but this was a documentation check, not legal advice, and Polymarket US (the CFTC-regulated arm) is a separate, more restrictive story if that's ever relevant.
- **The stray `middleware.ts` / `@supabase/ssr` file** that appeared on your machine was never explained. Neither of us built it. If it reappears, something in your toolchain is generating it — worth finding before it causes another confusing failure.

---

## 7. What "done" would actually require from here

Roughly in the order it'd make sense to tackle:

1. **Deploy to Coston2 for real** — the one thing that unlocks actually testing everything else end-to-end.
2. **`TrackingPanel` UI** for the Polymarket tracking markets — currently a fully-built backend feature with no way to use it.
3. **Market-creation UI** — right now, creating a market requires editing a deploy script.
4. **Portfolio page + activity feed UI** — data already exists via the API, just needs a frontend.
5. **Harden the AMM** — sell-side fee, better LP deposit design.
6. **Test the relayer against the real Polymarket API** from an unrestricted environment.
7. **A real security audit** before any real money is at stake.

---

## Bottom line

The core mechanics — market settlement, two different AMM/pricing designs, three resolver types, a full indexer, and a Polymarket-tracking feature — are real, working, and verified as thoroughly as a local/sandboxed environment allows, including catching genuine bugs along the way rather than just producing code that looks right. What's missing is mostly **surface area** (UI for features that already work on-chain) and **the first real contact with the live network**, which has been blocked by environment issues on your end that are now resolved. The honest gap between "a well-built testnet prototype" and "something ready for real users" is deployment, missing UI, and an audit — not fundamental architecture problems.
