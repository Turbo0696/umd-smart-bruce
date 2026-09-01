import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` (run on every install, including before a
// DATABASE_URL is configured) only needs the schema to be valid, not a
// working connection — so read the env var directly instead of the
// `env()` helper, which throws when it's unset.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
