import { defineConfig } from "@playwright/test";

// Three suites over the same scenario, headless, one at a time: the page objects (pom/), waygraph (waygraph/), and
// waygraph Blocks wrapping the page objects (adopt/). UI_CHANGE=<name> plays them against a changed UI (ui-change.ts).
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: { baseURL: "https://www.saucedemo.com", headless: true, actionTimeout: 10_000 },
  projects: [
    { name: "pom", testDir: "pom" },
    { name: "waygraph", testDir: "waygraph" },
    { name: "adopt", testDir: "adopt" },
  ],
});
