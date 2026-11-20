import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" throws outside the React server runtime; it's a no-op in tests.
      "server-only": path.resolve(__dirname, "test/empty.ts"),
    },
  },
  test: { environment: "node", testTimeout: 30000, hookTimeout: 60000 },
});
