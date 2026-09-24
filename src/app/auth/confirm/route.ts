import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's SSR client uses PKCE flow: the confirmation email link
// lands here with a `code` param that must be exchanged for a session
// server-side (so the session cookie is set before the redirect).
//
// `next` lets a specific flow (e.g. password recovery) send the user
// somewhere other than home after the session is set. Restricted to an
// on-site relative path — never taken as-is — so the code param can't be
// paired with an arbitrary `next` to redirect off-site.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
