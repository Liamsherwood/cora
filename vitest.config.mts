import path from "node:path"

import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

const root = import.meta.dirname

// Load .env, .env.local etc. for the global setup and the workers. Variables already set
// in the shell win. (@next/env would skip .env.local under NODE_ENV=test.)
for (const [k, v] of Object.entries(loadEnv("test", root, ""))) {
  process.env[k] ??= v
}

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // "server-only" throws outside the React server runtime; it's a no-op in tests.
      "server-only": path.join(root, "test/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // All integration tests share one Postgres database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
