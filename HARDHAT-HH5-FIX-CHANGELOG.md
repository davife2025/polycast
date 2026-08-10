# Hardhat HH5 fix changelog

Scope: `package.json` (exact version pins), new root `package-lock.json`.

## What was actually happening

Your error:
```
Error undefined: undefined
```
was Hardhat's CLI failing to format an error it didn't expect. With
`--show-stack-traces`, the real error underneath was:
```
HardhatError: HH5: HardhatContext is not created.
    at .../hardhat-ethers/src/internal/index.ts:19:18
```

That's a plugin-loading failure, happening while `hardhat.config.ts` itself
loads — before any task (compile, test, run) even gets selected. Notably,
it was loading `hardhat-ethers` from its raw `src/internal/index.ts`
TypeScript source rather than the compiled entry point its own
`package.json` points to (`internal/index.js`) — a strong sign of a
broken or mismatched dependency resolution.

## The real root cause: we never shipped a lockfile

Every delivery so far specified dependency versions with caret ranges
(`^5.0.0`, `^2.22.10`, etc.) and no `package-lock.json`. That means every
fresh `npm install` — yours, mine, anyone's — re-resolves those ranges
against whatever's currently published on the npm registry *at install
time*. Enough time (or enough new upstream publishes) between when I
verified this repo and when you installed it, and npm can land on a
different, untested combination of versions. That's almost certainly
what happened here.

## The fix

1. **Pinned exact versions** (no `^`) for `hardhat`, `@nomicfoundation/hardhat-toolbox`,
   `dotenv`, and `typescript` in `packages/contracts/package.json` — the
   exact combination (`hardhat@2.29.0`, `hardhat-toolbox@5.0.0`,
   `hardhat-ethers@3.1.3` as its dependency) that I directly verified
   works.
2. **Generated and included a real `package-lock.json`** at the repo
   root. This is the actual structural fix — with a lockfile committed,
   `npm install` reproduces the *exact same* dependency tree every time,
   for anyone, regardless of what's changed upstream since. This should
   have been shipped from the start; consider it a gap closed now rather
   than a one-off patch.

## What was verified, not just assumed fixed

- Fresh install with the pins → `npx hardhat compile` now gets **past**
  config loading entirely and reaches the actual compile step, failing
  only on this sandbox's already-known, unrelated network restriction
  (can't reach `binaries.soliditylang.org` — not a problem on your
  machine).
- All 18 contract tests re-run and still passing.
- The full `deploy.ts` script re-run end to end against a local network
  — still deploys everything and prints the same correct output.

## What to do

Replace your `package.json` at the repo root and
`packages/contracts/package.json`, drop in the new root
`package-lock.json`, then:

```bash
rm -rf node_modules packages/contracts/node_modules apps/web/node_modules apps/api/node_modules
npm install
cd packages/contracts && npm run compile
```

This should now get past the point you were stuck at. If `npm run compile`
still fails, but with a *different* error than before, share that — it'll
mean we're past this specific issue and onto something new.
