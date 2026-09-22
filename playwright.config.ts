import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // tests/unit runs on node:test (see `npm run test:unit`), not @playwright/test -
  // collecting it here breaks `playwright test` / `playwright test --ui`.
  testIgnore: "**/tests/unit/**",
  fullyParallel: true,
  reporter: "list",
  use: {
    headless: true,
    launchOptions: {
      // Canonical Chromium on this machine is the Flatpak install - never let
      // Playwright download its own bundled binary. See .agent/manager-agent.md.
      executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
