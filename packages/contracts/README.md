# @polycast/contracts

Hardhat project for Polycast's smart contracts, targeting **Flare Coston2 testnet**.

## Session 2 state

Real market mechanics and both production resolvers are implemented now:

- `contracts/PolycastMarket.sol` — full conditional-token mechanics on top of
  ERC-1155: `mintPair` (deposit collateral, receive equal YES+NO shares),
  `mergePair` (the inverse, pre-settlement), `settle()` (pulls the answer
  from the market's resolver), `redeem()` (winning shares pay out 1:1 in
  collateral post-settlement).
- `contracts/PolycastMarketFactory.sol` — deploys markets, prevents `marketId`
  reuse, gives `apps/api`'s indexer a single event stream to watch.
- `contracts/resolvers/FtsoPriceResolver.sol` — resolves crypto-price markets
  ("will BTC be above $X") directly against Flare's FTSOv2 feed. No dispute
  window: the feed value at the target time is the answer.
- `contracts/resolvers/FdcWeb2JsonResolver.sol` — resolves real-world-event
  markets against a verified FDC Web2Json attestation (an on-chain proof that
  a specific API returned a specific JSON result). The exact data source is
  locked in at market registration, so a submitted proof can only resolve
  the question it was registered against.
- `contracts/resolvers/ManualResolver.sol` — the Session 1 fallback, still
  here for markets with no clean verifiable data source.
- `contracts/mocks/MockERC20.sol` — test-only collateral token. **Never**
  deploy this as real collateral; it has an open `mint()`.

All four resolvers implement the same `IOutcomeResolver` interface, so
`PolycastMarket` doesn't need to know or care which one it's pointed at.

## Compiling

```bash
npm run compile
```

This uses Hardhat's normal compile task, which downloads the native solc
binary from `binaries.soliditylang.org`. If you're working in a sandboxed
environment without access to that host, use the fallback script instead,
which compiles the same contracts using the pure-JS `solc` npm package:

```bash
node compile-check.js
```

## Testing

```bash
npm test
```

This runs the full mocha/chai suite in `test/PolycastMarket.test.ts` against
Hardhat Network — real deployments, real ERC-1155 transfers between
accounts, real balance-delta assertions, real revert-reason checks. Covers:
mint/merge/redeem, the full "two users trade, one side wins" flow, access
control on `ManualResolver`, and factory `marketId` collision protection.

**If your environment can't reach `binaries.soliditylang.org`** (same
sandbox restriction as above), Hardhat's own `compile` step inside `test`
will fail before it even gets to your tests. Work around it the same way:
generate artifacts with the fallback compiler, then run tests against the
pre-built artifacts directly:

```bash
node build-artifacts.js   # compiles + writes artifacts/ in Hardhat's format
npx hardhat test --no-compile
```

`FtsoPriceResolver` and `FdcWeb2JsonResolver` aren't included in the local
test suite — they call Flare's `ContractRegistry` at a fixed address
(`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`) that only has code deployed
on real Flare networks (Coston2, Songbird, Flare Mainnet), not on a vanilla
Hardhat Network. Those two get validated by compiling cleanly against the
real `@flarenetwork/flare-periphery-contracts` interfaces (which `compile-check.js`
and `npm run compile` both do), and functionally verified once deployed to
Coston2 itself.

## Deploying to Coston2

1. Get a wallet funded with C2FLR from the faucet: https://faucet.flare.network/coston2
2. `cp .env.example .env` and set `PRIVATE_KEY` (testnet key only — never a mainnet key)
3. `npm run deploy:coston2`

This deploys `ManualResolver` and one `PolycastMarket` wired to it, as a
smoke test that the toolchain and network config actually work end-to-end.
Session 3 extends this script to also deploy the factory and both
production resolvers.

## Why ManualResolver still exists alongside FTSO/FDC

Flare's FDC Web2Json attestation type — the piece that lets a market resolve
against an arbitrary verified API (sports score, election result, etc.)
without a human dispute process — is still limited to Coston/Coston2 and
requires each data source endpoint to go through a governance approval
process before it can be used. `ManualResolver` remains the fallback for:
markets with no clean API source, and networks/timeframes where Web2Json
coverage doesn't reach yet.

## How a Web2Json market actually gets resolved (operational flow)

1. At market creation, decide on a data source and reduce it to a single
   boolean via a jq filter (e.g. "did the Lakers win on 2026-08-02" → jq
   filter extracts the winner, compares to "Lakers", outputs `true`/`false`).
2. Call `FdcWeb2JsonResolver.registerMarket(marketId, requestBody)` — this
   locks in the exact URL/filter *before* the outcome is known.
3. Off-chain, submit that same request to Flare's `FdcHub` (paying the
   attestation fee), wait for it to land in a voting round, then fetch the
   Merkle proof from Flare's Data Availability layer.
4. Submit that proof via `FdcWeb2JsonResolver.resolveWithProof(marketId, proof)`.
   The contract verifies the proof is genuine, checks it answers the exact
   registered question, decodes the boolean, and resolves the market.

Steps 1-2 and 4 are on-chain (covered by this repo); step 3 is an off-chain
script that Session 4's indexer service will automate.

