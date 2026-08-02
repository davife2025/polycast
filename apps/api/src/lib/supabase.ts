import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 *
 * This key bypasses Row Level Security, so it must only ever live here
 * in apps/api (never in apps/web, never in a browser bundle, never
 * committed to git). It's used by the indexer to write on-chain events
 * into Supabase tables that apps/web reads from with the restricted
 * anon key.
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);
