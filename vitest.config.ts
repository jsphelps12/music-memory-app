import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // `.claude/worktrees/**` holds full checkouts of this repo for parallel
    // agent sessions. Vitest's default exclude doesn't cover them, so every
    // worktree present contributes a second copy of every suite and the run
    // reports inflated counts plus failures from a tree nobody is editing.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
  // React Native injects __DEV__ as a global; under vitest it is simply
  // undefined, so lib code that guards a dev-only console.warn with it
  // (lib/timelinePrefetch.ts's network catch, lib/storage.ts's delete failure
  // path) throws ReferenceError the moment a test exercises the failure
  // branch — precisely the branches worth testing.
  define: { __DEV__: false },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
