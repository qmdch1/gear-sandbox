import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
    // This suite's heaviest tests run hundreds of real simulation ticks over multi-gear
    // layouts and assert per-gear on every one of them, which legitimately takes seconds --
    // well past vitest's 5s default once several such files run at once.
    testTimeout: 20000,
    hookTimeout: 20000,
    // Cap the worker pool. The default forks one worker per core (18 here), and each loads
    // its own copy of THREE.js (plus jsdom for the render tests). With only a couple of GB
    // free that oversubscribes memory badly: the suite slowed from ~5s to ~96s, tests began
    // timing out purely from contention, and one worker failed to start at all. Six workers
    // keeps the parallelism worth having while staying inside the memory budget.
    poolOptions: {
      forks: { maxForks: 6, minForks: 1 },
    },
  },
});
