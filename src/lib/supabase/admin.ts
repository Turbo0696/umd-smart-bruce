import { createClient } from "@supabase/supabase-js";

// Service-role client for server-only operations (Storage uploads for
// tutor materials) that don't go through a user's own RLS context.
// Callers are responsible for their own authorization checks before
// using this — it bypasses RLS entirely.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
