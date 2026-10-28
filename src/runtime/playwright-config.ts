import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlaywrightTestConfig } from "@playwright/test";
import type { WaygraphConfig } from "./waygraph-config.js";

/** Where `waygraph test --flows` finds its two spec files (cli/flow-tests/, next to this file's folder in dist). */
const FLOW_TESTS = join(dirname(fileURLToPath(import.meta.url)), "..", "cli", "flow-tests");

/**
 * The test runner's config for a project, built from its waygraph config. `waygraph test` uses this when there is no
 * playwright.config. With `flows`, the tests are the project's flows: every flow in parallel, then the exclusive ones
 * (`map({ exclusive: true })`) one at a time.
 */
export function playwrightConfigFrom(config: WaygraphConfig, projectDir: string, baseURL: string | undefined, flows = false): PlaywrightTestConfig {
  const { use, ...rest } = config.playwright ?? {};
  const webServers = [config.webServer ?? []].flat().map((s) => ({ ...s, cwd: join(projectDir, s.cwd ?? ".") }));
  return {
    testDir: join(projectDir, config.testDir ?? "tests"),
    outputDir: join(projectDir, "test-results"),
    fullyParallel: true,
    reporter: [["list"], ["html", { open: "never", outputFolder: join(projectDir, "playwright-report") }]],
    ...(webServers.length > 0 ? { webServer: webServers } : {}),
    ...rest,
    ...(flows
      ? {
          projects: [
            { name: "flows", testDir: FLOW_TESTS, testMatch: "flows.spec.js" },
            { name: "flows-exclusive", testDir: FLOW_TESTS, testMatch: "flows-exclusive.spec.js", dependencies: ["flows"], fullyParallel: false },
          ],
        }
      : {}),
    use: { baseURL, trace: "retain-on-failure", ...use },
  };
}
