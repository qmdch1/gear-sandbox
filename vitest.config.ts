import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/ui/**", "jsdom"], ["tests/render/**", "jsdom"]],
  },
});
