# Final fix — please follow exactly, don't improvise on top of it

The root cause of this whole cycle: Hardhat's own error messages suggest
remediation steps (`npm pkg set type="module"`, installing a newer
`hardhat-toolbox`) that push you toward Hardhat 3 — the opposite of what
this repo needs. Every time that got tried, it overwrote the pinned
versions and reintroduced the same class of error in a new shape.

## Steps — do only these, in this order

1. **Delete** `packages/contracts/package.json`, your root `package.json`,
   and your root `package-lock.json`.
2. Copy in this zip's three files to those exact locations.
3. From the repo root:
   ```bash
   rm -rf node_modules packages/contracts/node_modules apps/web/node_modules apps/api/node_modules
   npm ci
   ```
   (`npm ci`, not `npm install` — it installs exactly what's in the
   lockfile with zero re-resolution.)
4. From `packages/contracts`:
   ```bash
   npm run compile
   ```

## What to expect

This should now actually download the Solidity compiler and succeed,
since your machine has normal internet access (this sandbox's own
testing environment doesn't, which is a separate, unrelated restriction
that doesn't apply to you).

**If step 4 fails with a *different* error than before** (not the ESM
message, not the HH5 message, not a toolbox version warning) — stop and
paste it back to me before trying anything else. In particular:

- If it's a network/download error (e.g. `HH502`, can't reach
  `binaries.soliditylang.org`) — don't troubleshoot your network or
  install anything new. Just run this instead, which compiles without
  needing that download at all:
  ```bash
  node compile-check.js
  ```

## Please don't do these, even if suggested by an error message

- Don't run `npm pkg set type="module"`
- Don't run `npm install <anything>@latest`
- Don't manually bump `hardhat` or `@nomicfoundation/hardhat-toolbox` to
  a different version
- Don't run `npm install --save-dev "@nomicfoundation/hardhat-toolbox@hh2"`
  or similar — the pinned versions already in this zip are the correct,
  tested combination

If something still doesn't work after following only the four numbered
steps above, that's a real, new problem worth solving together — but
solving it by installing something different is what caused this cycle
three times already.
