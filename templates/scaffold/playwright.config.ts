import { defineConfig } from "@playwright/test";

const FIXTURE_PORT = process.env.WAYGRAPH_FIXTURE_PORT || "4177";
const FIXTURE_HOST = process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1";
const FIXTURE_ORIGIN = `http://${FIXTURE_HOST}:${FIXTURE_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: FIXTURE_ORIGIN,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || process.env.CHROMIUM_PATH,
    },
  },
  webServer: {
    command: "node scripts/fixture-server.mjs",
    url: `${FIXTURE_ORIGIN}/home.html`,
    reuseExistingServer: !process.env.CI,
    env: {
      WAYGRAPH_FIXTURE_PORT: FIXTURE_PORT,
      WAYGRAPH_FIXTURE_HOST: FIXTURE_HOST,
      WAYGRAPH_FIXTURE_QUIET: "1",
    },
  },
});
