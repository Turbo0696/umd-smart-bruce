// Embed mode: any page loaded with `?embed=1` (e.g. inside a Canvas iframe)
// renders without the hamburger menu or footer, so students can't navigate
// away from the embedded tool. The proxy turns the query param into a
// request header, since the root layout can't read search params itself.

export const EMBED_HEADER = "x-embed";

// `?embed`, `?embed=1`, `?embed=true` all count; `?embed=0`/`false` don't.
export function isEmbedParam(value: string | null): boolean {
  return value !== null && value !== "0" && value.toLowerCase() !== "false";
}
