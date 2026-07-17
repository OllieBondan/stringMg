import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    env: {
      CSV_CAS_DELAY_MS: "10", // keep compare-and-swap retry waits fast in tests
    },
  },
});
