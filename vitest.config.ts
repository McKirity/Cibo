import { defineConfig } from "vitest/config";

/**
 * The test runner, wired at Phase 2 step 2 (the bug testing audit) for the
 * ruled scope and no more: **targeted unit tests on the pure cores** — the
 * metrics derivation layer, `src/db/validate.ts`, and the seeder's invariants.
 * UI is left to exploratory testing (ruled 2026-07-20), so there is no jsdom,
 * no component harness, and no browser mode here.
 *
 * DELIBERATELY SEPARATE from `vite.config.ts`. The app config carries the React
 * plugin, Evolu's optimizeDeps exclusions, the Tauri dev-server pinning, and
 * three `define` constants injected at build time — none of which the pure
 * cores need, and all of which would be load-bearing surface area in a test
 * run. The cores import no Evolu, no DOM and no clock by construction; if a
 * test ever needs any of that, the module under test has stopped being pure and
 * that is the finding.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
