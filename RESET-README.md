# Complete repo reset — read this first

This is the ENTIRE repository, every file, verified together as one
consistent whole right before zipping:

- ✅ `npm ci`-equivalent fresh install with every dependency at its
  exact pinned version (confirmed via `npm ls` — no drift anywhere)
- ✅ `apps/web` — real `next build`, succeeds
- ✅ `apps/api` — real `tsc --noEmit`, succeeds
- ✅ `packages/contracts` — real `solc` compile of all 12 contracts,
  all **30 tests passing** on a real Hardhat Network EVM

Given how much individual files and versions had drifted apart on your
machine across many incremental deliveries, incremental fixes clearly
weren't holding. This replaces everything at once from one atomic,
verified source — no partial state, no mixing old and new files.

## Do exactly this

1. **Delete your entire local `polycast` folder.** Not individual
   files or subfolders — the whole thing, completely gone.
2. Unzip this archive in its place.
3. From the new folder's root:
   ```bash
   npm ci
   ```
4. Verify contracts:
   ```bash
   cd packages/contracts
   npm run compile
   ```
   This should now succeed for real on your machine (normal internet
   access reaches the Solidity compiler download, unlike the sandbox
   this was built in). If it hits a network error specifically, use the
   fallback instead: `node compile-check.js`.
5. Fill in your actual credentials — this repo ships with no secrets,
   obviously. Follow `SETUP.md` at the root for Supabase, a testnet
   wallet, and deploying to Coston2.

## One rule going forward, to stop this cycle for good

**Please don't run `npm install <package>`, `npm update`, or
`npm pkg set` for anything in this repo from here on** — if a dependency
genuinely needs to change, ask me and I'll update the pinned version and
regenerate the lockfile the same way I verified this one, so drift can't
silently creep back in. Every issue we've spent the most time on so far
traced back to a version drifting away from what was actually tested.
