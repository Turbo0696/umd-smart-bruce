"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Merely constructing the browser client triggers Supabase's
// detectSessionInUrl handling, which picks up an implicit-flow session
// (#access_token=...) if one is present in the URL — covering email
// confirmation links that don't use PKCE's ?code= param, which the
// server-side /auth/confirm route handles instead. Once a session
// lands, refresh so server components (e.g. the nav) pick it up.
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
