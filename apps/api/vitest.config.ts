import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.integration.test.ts", "tests/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.integration.test.ts", "apps/**/test/**/*.test.ts", "apps/**/test/**/*.integration.test.ts"],
    environment: "node"
  }
});
