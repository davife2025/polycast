# UI hardening changelog

Scope: `apps/web` — fixing real dead-click and silent-failure bugs found
while reviewing the frontend after your "nothing is clicking" report.

## The actual answer to "nothing is clicking"

Confirmed with you directly: no contracts are deployed to Coston2 yet,
so `MarketsList` correctly shows its empty state — there are no market
cards to click because none exist. That part is working as designed.

But reviewing the code surfaced three **real** bugs along the way, all
in the same family: things that look interactive but silently do
nothing, which is exactly what "nothing is clicking" would also describe
once contracts *are* deployed.

## Bug 1: fake-clickable nav items

`Portfolio` and `Docs` in `Nav.tsx` were `<span>` elements styled with
`cursor-pointer` — visually identical to a real link, but with no
`onClick` or `href` at all. Neither page exists yet (Portfolio is still
on the roadmap). Fixed by removing the misleading pointer styling and
adding a `title="Coming soon"` tooltip instead of leaving a dead click
in place.

## Bug 2: zero feedback on failed or rejected transactions

This is the more important one. Across `TradingPanel.tsx` and
`MarketDetail.tsx`, every write action (`buy`, `sell`, `mintPair`,
`mergePair`, `settle`, `redeem`, both approval flows) called
`useWriteContract()` but never read its `error` state. If a user
rejected a wallet popup, or a transaction reverted on-chain, the button
would just return to normal with **no visible indication anything went
wrong** — indistinguishable from a UI that's simply broken.

Fixed in both components:
- Capture `error` from both `useWriteContract` and
  `useWaitForTransactionReceipt`, and show it in a clear inline banner
  using each error's `shortMessage` (viem's human-readable reason)
  rather than a raw stack trace.
- Show a "Transaction confirmed" success banner too, so a successful
  action gets visible confirmation instead of just a silent balance
  update.
- Call `reset()` at the start of every new action, so a stale error from
  a previous attempt doesn't linger and confuse the next one.

## Bug 3: real read errors disguised as "nothing here yet"

`MarketsList.tsx`'s top-level `getAllMarkets()` read, and
`MarketDetail.tsx`'s market data read, both only checked `isLoading` —
if the read *failed* (wrong network, unreachable RPC, bad address),
`data` just stayed `undefined` forever. That fell through to "No markets
created yet" or an infinite "Loading market…", both of which look like
normal empty/loading states rather than the actual problem: something is
genuinely broken and the page can't reach the chain.

Fixed by explicitly checking each read's `error` and rendering a
distinct message when it's non-null, telling the user to check their
network connection — rather than a misleading empty state.

## Also: de-duplicated the status badge

The "Open" / "Resolved: YES/NO" badge markup was copy-pasted between
`MarketsList.tsx` and `MarketDetail.tsx`. Extracted into a shared
`components/StatusBadge.tsx` — no behavior change, just one less place
for the two to quietly drift apart later.

## What was verified, not just written

- Real `tsc --noEmit` — clean.
- Real `next build` — both routes still compile and prerender.
- Manually traced through the exact failure paths described above (dead
  spans with no handlers, `useWriteContract` calls with unread `error`
  fields, reads with unchecked `error` fields) rather than guessing at
  what might be wrong — each one is a concrete, findable issue in the
  code, not a hypothetical.

## Still true, not new

Nothing about the "nothing is clicking because nothing is deployed yet"
situation changed — that's expected. The next real step is deploying to
Coston2 (see `SETUP.md`), at which point these fixes will actually
matter: markets will render, and any failed transaction will now tell
you why instead of just sitting there.
