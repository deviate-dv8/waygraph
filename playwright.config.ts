import { defineConfig } from "@playwright/test";
import { chromiumExecutablePath } from "./src/runtime/browser.js";

// Specs that drive the live saucedemo.com or spawn session processes: a dozen of them at once overload the site and the
// machine, and fail on timeouts that never show alone. They run in their own project, two at a time; the rest stay
// fully parallel.
const LIVE = [
  "auto-explore/inventory-bulk-menu",
  "cli/auto-session",
  "cli/auto-session-blind-pilot",
  "cli/browser-inject",
  "cli/flags",
  "cli/input",
  "cli/mem-stub",
  "cli/overlay-beacon",
  "cli/pilot",
  "cli/replay",
  "flow-run/chain-flow-episodes",
  "pilot/pilot",
].map((spec) => `**/tests/${spec}.spec.ts`);

export default defineConfig({
  testDir: "./tests",
  // tests/unit runs on node:test (see `npm run test:unit`), not @playwright/test -
  // collecting it here breaks `playwright test` / `playwright test --ui`.
  testIgnore: "**/tests/unit/**",
  fullyParallel: true,
  // CI (GitHub's shared 2-core runners) has genuinely less headroom than most dev machines - a
  // handful of specs here hit real network (saucedemo.com) or measure wall-clock timing, and both
  // get measurably flakier under resource contention. Retries absorb that without masking a real,
  // deterministic failure (which still fails on every retry too, and still shows up red). Capping
  // workers on CI is the standard pairing - Playwright's own worker-count default assumes far more
  // headroom than a 2-core runner actually has.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    // A project's testIgnore replaces the one above: name tests/unit again, or its node:test files are imported and run
    // inside the workers (one of them points HOME elsewhere, and later tests can't find the browser).
    { name: "local", testIgnore: [...LIVE, "**/tests/unit/**"] },
    { name: "live", testMatch: LIVE, workers: 2 },
  ],
  use: {
    headless: true,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: chromiumExecutablePath(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
