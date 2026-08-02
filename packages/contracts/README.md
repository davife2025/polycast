# @polycast/contracts

Hardhat project for Polycast's smart contracts, targeting **Flare Coston2 testnet**.

## Session 1 state

What's here now is a structural skeleton, not the final market logic:

- `contracts/interfaces/IOutcomeResolver.sol` — the interface every resolver
  implements (FTSO, FDC Web2Json, and manual/fallback all speak this).
- `contracts/resolvers/ManualResolver.sol` — a simple owner-posts-the-answer
  resolver. This is the *only* working resolver right now, so the rest of the
  stack has something real to build and test against before Session 2 adds
  `FtsoPriceResolver` (crypto price markets, no dispute window) and
  `FdcWeb2JsonResolver` (real-world event markets via Flare's Data Connector).
- `contracts/PolycastMarket.sol` — defines the market's shape (question,
  collateral token, resolver, settle()) but not yet the actual conditional-token
  mechanics (mint pair / split / merge / redeem). Those land in Session 2.

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

## Deploying to Coston2

1. Get a wallet funded with C2FLR from the faucet: https://faucet.flare.network/coston2
2. `cp .env.example .env` and set `PRIVATE_KEY` (testnet key only — never a mainnet key)
3. `npm run deploy:coston2`

This deploys `ManualResolver` and one `PolycastMarket` wired to it, as a
smoke test that the toolchain and network config actually work end-to-end.

## Why ManualResolver first, not FTSO/FDC immediately

Flare's FDC Web2Json attestation type — the piece that lets a market resolve
against an arbitrary verified API (sports score, election result, etc.)
without a human dispute process — is still limited to Coston/Coston2 and
requires each data source endpoint to go through a governance approval
process before it can be used. Rather than block Session 1 on that, every
market ships with a working manual fallback, and FTSO/FDC resolvers get
added as additional `IOutcomeResolver` implementations in Session 2 —
markets can then be created pointing at whichever resolver fits the
question.
