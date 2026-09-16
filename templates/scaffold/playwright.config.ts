import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    launchOptions: {
      executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH,
    },
  },
});
