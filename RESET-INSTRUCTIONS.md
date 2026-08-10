# apps/web full reset instructions

Same situation as the contracts folder before: individual files had
drifted out of sync (your `lib/chain.ts` predates Session 5's
`ammFactoryAddress` export, and dependency versions had drifted to a
completely different major of Next.js). This replaces the whole thing
at once, verified internally consistent, with every dependency now
pinned to an exact version (no more `^` ranges) so this can't silently
drift again on a future install.

## Do this exactly

1. **Delete your entire local `apps/web` folder completely** — not
   individual files, the whole folder. This also removes the stray
   `middleware.ts`/`@supabase/ssr` file neither of us recognizes, since
   it's not part of anything in this reset.
2. Copy this zip's `apps/web` folder to that exact location.
3. Replace `apps/api/package.json` with this zip's copy too (pinned the
   same way, in the same pass).
4. Replace your root `package.json` and `package-lock.json` with this
   zip's copies.
5. From the repo root:
   ```bash
   rm -rf node_modules apps/web/node_modules apps/api/node_modules packages/contracts/node_modules
   npm ci
   ```
6. From `apps/web`:
   ```bash
   npm run build
   ```

This should now build clean — I ran this exact build myself right
before packaging this and it succeeded with `next@14.2.15`,
`wagmi@2.12.25`, and `viem@2.21.19` all resolving to the exact pinned
versions.

## If `middleware.ts` reappears after this

It isn't part of anything I built, so if it comes back, something in
your workflow (an editor extension, a Supabase CLI command, some other
tool) is regenerating it. Worth checking what's actually creating that
file before it causes the same error again.
