import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    headless: true,
    baseURL: "https://www.saucedemo.com",
    trace: "retain-on-failure",
  },
});
