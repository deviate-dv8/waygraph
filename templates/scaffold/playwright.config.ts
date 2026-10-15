import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    // Demo pages open via file:// - no server. Filled in by `waygraph init`.
    baseURL: "__APP_BASE_DIR_FILE_URL__",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH,
    },
  },
});
