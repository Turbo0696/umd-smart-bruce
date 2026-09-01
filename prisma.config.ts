import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` (run on every install, including before a
// DATABASE_URL is configured) only needs the schema to be valid, not a
// working connection — so read the env var directly instead of the
// `env()` helper, which throws when it's unset.
//
// This `url` is only used by CLI commands (migrate, db push, studio),
// not by the app at runtime — the app connects via the driver adapter
// in src/lib/prisma.ts using DATABASE_URL (the pooled connection).
// Migrations need the session-mode pooler (DIRECT_URL) instead, since
// Supabase's transaction pooler doesn't support the prepared
// statements Migrate relies on.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
