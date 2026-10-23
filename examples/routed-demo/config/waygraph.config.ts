import { Engine, defineConfig } from "waygraph";

const config = defineConfig({
  baseUrl: "http://127.0.0.1:4277",
  testDir: "./tests",
  webServer: {
    command: "node scripts/fixture-server.mjs",
    url: "http://127.0.0.1:4277/dashboard",
    reuseExistingServer: !process.env.CI,
  },
  playwright: {
    workers: 1,
    fullyParallel: false,
    timeout: 30_000,
    use: { headless: true, trace: "retain-on-failure" },
  },
});

export default config;
export const engine = new Engine(config);
