import { defineConfig } from "@playwright/test";

const PORT = process.env.WAYGRAPH_FIXTURE_PORT || "4277";
const HOST = process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    headless: true,
    baseURL: process.env.WAYGRAPH_BASE_URL || `http://${HOST}:${PORT}`,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
