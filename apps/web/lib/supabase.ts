import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 *
 * IMPORTANT: this uses the public anon key and Row Level Security policies
 * defined in packages/supabase/schema.sql. It should only ever be used for
 * READS that power the UI (market listings, trade history display).
 *
 * It must never be the source of truth for balances or be trusted for
 * anything that moves money — that always goes through the chain via the
 * user's own wallet. See packages/contracts and the note in the root README.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
);
