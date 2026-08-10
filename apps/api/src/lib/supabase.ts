import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — apps/api can't " +
      "reach the database yet.\n" +
      "Copy apps/api/.env.example to apps/api/.env and fill in your " +
      "Supabase project's credentials (Project Settings > API). See " +
      "SETUP.md at the repo root for the full walkthrough.\n" +
      "The server will still start, but any route or indexer call that " +
      "touches Supabase will fail until this is set.",
  );
}

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 *
 * This key bypasses Row Level Security, so it must only ever live here
 * in apps/api (never in apps/web, never in a browser bundle, never
 * committed to git). It's used by the indexer to write on-chain events
 * into Supabase tables that apps/web reads from with the restricted
 * anon key.
 *
 * NOTE: if the env vars above aren't set, this still constructs a client
 * (using placeholder values that are valid-looking but not real) rather
 * than crashing the whole process at import time. `createClient` only
 * validates that its arguments look like a URL/key — it doesn't make a
 * network call — so this defers the actual failure to whenever code
 * first tries to genuinely use Supabase, at which point it fails with a
 * clear connection error instead of taking down the entire API before
 * it can even respond to `/health`. This matches the same
 * fail-gracefully philosophy the indexer already follows (see
 * indexer/index.ts) — a missing credential shouldn't be able to crash
 * the whole service.
 */
export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseServiceRoleKey || "placeholder-service-role-key",
);
