import { join } from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import type { WaygraphConfig } from "./config.js";

/** The test runner's config for a project, built from its waygraph config. `waygraph test` uses this when there is no playwright.config. */
export function playwrightConfigFrom(config: WaygraphConfig, projectDir: string, baseURL: string | undefined): PlaywrightTestConfig {
  const { use, ...rest } = config.playwright ?? {};
  const webServers = [config.webServer ?? []].flat().map((s) => ({ ...s, cwd: join(projectDir, s.cwd ?? ".") }));
  return {
    testDir: join(projectDir, config.testDir ?? "tests"),
    outputDir: join(projectDir, "test-results"),
    fullyParallel: true,
    reporter: [["list"], ["html", { open: "never", outputFolder: join(projectDir, "playwright-report") }]],
    ...(webServers.length > 0 ? { webServer: webServers } : {}),
    ...rest,
    use: { baseURL, trace: "retain-on-failure", ...use },
  };
}
