import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    headless: true,
    baseURL: "https://www.saucedemo.com",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
