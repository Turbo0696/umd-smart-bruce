import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's SSR client uses PKCE flow: the confirmation email link
// lands here with a `code` param that must be exchanged for a session
// server-side (so the session cookie is set before the redirect).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
