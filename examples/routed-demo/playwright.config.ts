import { defineConfig } from "@playwright/test";
import { chromiumExecutablePath } from "waygraph";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "node scripts/fixture-server.mjs",
    url: "http://127.0.0.1:4277/dashboard",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:4277",
    trace: "retain-on-failure",
    launchOptions: { executablePath: chromiumExecutablePath() },
  },
});
