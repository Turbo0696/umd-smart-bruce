import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { EMBED_HEADER, isEmbedParam } from "@/lib/embed";

// Refreshes the Supabase session cookie on every request so server
// components always see a valid (non-expired) session.
// Also forwards `?embed=1` as a request header (see src/lib/embed.ts).
export async function proxy(request: NextRequest) {
  const embed = isEmbedParam(request.nextUrl.searchParams.get("embed"));

  // Built fresh each time (rather than cloned once up front) so cookie
  // updates made in setAll below are carried along with the embed header.
  const next = () => {
    const headers = new Headers(request.headers);
    if (embed) headers.set(EMBED_HEADER, "1");
    else headers.delete(EMBED_HEADER);
    return NextResponse.next({ request: { headers } });
  };

  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|video/).*)"],
};
