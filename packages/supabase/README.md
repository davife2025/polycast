# @polycast/supabase

Database schema for Polycast's off-chain read cache.

## Applying the schema

1. Create a Supabase project.
2. Open the SQL editor and run `schema.sql`.
3. Copy the project URL and keys into your `.env` files:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `apps/web`
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` → `apps/api` (service role key only here — never in the browser)

## What lives here vs. on-chain

| Data | Source of truth |
|---|---|
| Market question, resolver config | On-chain at creation, mirrored here for fast display |
| Current YES/NO price, volume | On-chain (contract state) — cached here, refreshed by the indexer |
| Who owns which outcome shares | **On-chain only.** Never trust a Supabase row for this. |
| Resolution outcome | **On-chain only.** `resolutions` table here is an audit trail, not the authority. |

See the root `README.md` for the full rationale.
