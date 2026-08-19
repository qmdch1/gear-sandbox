import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["tests/ui/**/*.test.ts", "jsdom"],
      ["tests/render/**/*.test.ts", "jsdom"]
    ],
  },
});
