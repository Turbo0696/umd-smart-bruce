import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only, covering the pure Beer Game logic (engine, analytics, cohort
// drawing, config parsing, CSV escaping). Everything under test is plain
// TypeScript with no JSX and no database, so a node environment is enough and
// there's no need for the React plugin or a jsdom install.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirrors the `@/*` path mapping in tsconfig.json. fileURLToPath rather
      // than new URL().pathname so the alias resolves correctly on Windows,
      // where the latter yields a leading-slash path like /C:/...
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
