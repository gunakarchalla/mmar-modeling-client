import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@gds": path.resolve(import.meta.dirname, "../mmar-global-data-structure"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    // Node stays the default so store/service suites run without a DOM.
    // Component tests opt into jsdom per-file with a `@vitest-environment jsdom`
    // docblock — cheaper than a global switch, and it keeps the blast radius small.
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Scaffold has no tests yet; keep `npm test` green until migration adds them.
    passWithNoTests: true,
    // The live-server integration tests (*.integration.test.ts) do heavy work: the
    // in-container GET /metamodel/sceneTypes payload (~29 MB) plus the gds
    // `Metamodel.fromJS` revive. P3 raised this 5000 -> 20000 when that cost ~4-5s.
    // P8 raised it again: those tests now take ~10s EACH in isolation, and the suite's
    // growing set of jsdom component files starves them under parallel-file load, so
    // all three false-timed-out at 20s while passing on their own. Unit suites are
    // unaffected (they finish in ms) — only the live tests use this headroom.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
