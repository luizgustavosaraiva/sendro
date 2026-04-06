import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/**/*.test.ts",
      "test/**/*.integration.test.ts",
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx"
    ],
    environment: "node"
  }
});
