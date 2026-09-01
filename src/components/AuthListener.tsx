"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// @supabase/ssr's browser client hardcodes flowType: "pkce", which makes
// its built-in detectSessionInUrl *reject* an implicit-flow callback
// (#access_token=... in the hash) instead of processing it — Supabase's
// admin-generated links (and possibly some email templates) use that
// implicit style. So we parse the hash ourselves and apply it via
// setSession(), which has no such flowType guard. PKCE links (?code=)
// are handled separately, server-side, by /auth/confirm.
//
// A full reload (not router.refresh()) is used afterward: the new
// session cookie is readable by the server on a fresh navigation, but
// router.refresh()'s soft refresh was observed to race ahead of the
// cookie write and miss it. This only runs once, right after landing
// from an email link, so a hard reload is an acceptable trade-off.
export function AuthListener() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) {
        console.error("[AuthListener] setSession failed:", error.message);
        return;
      }
      window.location.replace(window.location.pathname + window.location.search);
    });
  }, []);

  return null;
}
