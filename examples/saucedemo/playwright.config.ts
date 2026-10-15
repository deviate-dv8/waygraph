import { defineConfig } from "@playwright/test";
import { chromiumExecutablePath } from "waygraph";

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
    launchOptions: {
      executablePath: chromiumExecutablePath(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
