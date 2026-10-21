import { defineConfig } from "@playwright/test";
import { chromiumExecutablePath } from "./src/browser.js";

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
  use: {
    headless: true,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: chromiumExecutablePath(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
