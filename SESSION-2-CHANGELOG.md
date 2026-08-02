# Session 2 changelog

Scope: `packages/contracts` only. No other workspace changed this session.

## New files

- `contracts/PolycastMarketFactory.sol` — deploys markets, tracks a registry,
  guards against `marketId` reuse.
- `contracts/resolvers/FtsoPriceResolver.sol` — crypto price market resolver,
  reads Flare's FTSOv2 feed directly via the real
  `@flarenetwork/flare-periphery-contracts` interfaces (Coston2 build).
- `contracts/resolvers/FdcWeb2JsonResolver.sol` — real-world event market
  resolver, verifies an FDC Web2Json attestation proof on-chain.
- `contracts/mocks/MockERC20.sol` — test-only collateral token.
- `test/PolycastMarket.test.ts` — full mocha/chai suite: mint/merge/redeem,
  a two-party trade + settle + redeem flow, `ManualResolver` access control,
  factory `marketId` collision protection. **8/8 passing.**
- `build-artifacts.js` — fallback tool (same idea as Session 1's
  `compile-check.js`) for environments that can't reach
  `binaries.soliditylang.org`: builds Hardhat-format artifacts via the pure-JS
  `solc` package so `npx hardhat test --no-compile` can still run for real.

## Changed files

- `contracts/PolycastMarket.sol` — was a structural skeleton in Session 1
  (just `settle()`), now has the full conditional-token mechanics:
  `mintPair`, `mergePair`, `redeem`, built on ERC-1155 (tokenId 0 = NO,
  1 = YES).
- `scripts/deploy.ts` — now deploys the full set (factory, all three
  resolvers, a demo market) instead of just `ManualResolver` + one market.
- `package.json` — added `@flarenetwork/flare-periphery-contracts` dependency.
- `README.md` — documents the Session 2 contracts, testing instructions
  (including the sandboxed-network fallback), and the Web2Json operational
  flow (register → off-chain attestation → submit proof).

## What was verified, not just written

- All contracts compile clean against Solidity 0.8.25 with real
  `@openzeppelin/contracts` and `@flarenetwork/flare-periphery-contracts`
  imports resolved (`node compile-check.js`).
- The core mechanics (`PolycastMarket`, `PolycastMarketFactory`,
  `ManualResolver`, `MockERC20`) were exercised with real transactions on
  Hardhat Network: minting, ERC-1155 transfers between two accounts,
  resolving, redeeming, and checking exact balance deltas — 8/8 tests pass.
- `FtsoPriceResolver` and `FdcWeb2JsonResolver` are compile-verified against
  the genuine Flare interfaces but not dynamically tested locally, since
  they call a `ContractRegistry` address that only has code on real Flare
  networks. These get their first live exercise once deployed to Coston2
  (Session 3 territory, or can be done now via `npm run deploy:coston2`
  with a funded testnet key).

## Not yet done (later sessions)

- Order book / AMM for actual price discovery between YES/NO shares
  (Session 3+, frontend wiring territory).
- Off-chain script to submit a Web2Json attestation request to `FdcHub`
  and fetch the resulting proof from the Data Availability layer (Session 4,
  indexer territory) — the on-chain half (`registerMarket` /
  `resolveWithProof`) is done, the off-chain half isn't.
- Dispute window on `ManualResolver` (currently instant, single-admin —
  fine for a fallback, not fine as a primary resolution path at scale).
