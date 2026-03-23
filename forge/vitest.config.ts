import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["@mythologiq/qore-contracts"]
        }
      }
    }
  }
});
