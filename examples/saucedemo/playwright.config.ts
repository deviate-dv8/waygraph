import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    headless: true,
    baseURL: "https://www.saucedemo.com",
    launchOptions: {
      // Canonical Chromium on this machine is the Flatpak install - never let
      // Playwright download its own bundled binary. See .agent/manager-agent.md.
      executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
