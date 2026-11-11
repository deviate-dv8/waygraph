import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlaywrightTestConfig } from "@playwright/test";
import type { WaygraphConfig } from "./waygraph-config.js";
import { resolveDevice, type Device } from "../engine/flow/device.js";

/** Where `waygraph test --flows` finds its two spec files (cli/flow-tests/, next to this file's folder in dist). */
const FLOW_TESTS = join(dirname(fileURLToPath(import.meta.url)), "..", "cli", "flow-tests");

/**
 * The test runner's config for a project, built from its waygraph config. `waygraph test` uses this when there is no
 * playwright.config. With `flows`, the tests are the project's flows: every flow in parallel, then the exclusive ones
 * (`map({ exclusive: true })`) one at a time.
 */
export function playwrightConfigFrom(
  config: WaygraphConfig,
  projectDir: string,
  baseURL: string | undefined,
  flows = false,
  filter: { grep?: string | undefined; grepInvert?: string | undefined } = {},
): PlaywrightTestConfig {
  // Which flows run (--grep, --label, --grep-invert) is set on both flows projects: the exclusive one depends on the
  // other, and Playwright runs a dependency in full whatever the command line filters.
  const picked = {
    ...(filter.grep ? { grep: pattern(filter.grep) } : {}),
    ...(filter.grepInvert ? { grepInvert: pattern(filter.grepInvert) } : {}),
  };
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
            { name: "flows", testDir: FLOW_TESTS, testMatch: "flows.spec.js", ...picked },
            { name: "flows-exclusive", testDir: FLOW_TESTS, testMatch: "flows-exclusive.spec.js", dependencies: ["flows"], fullyParallel: false, ...picked },
          ],
        }
      : {}),
    // The config's device (desktop unless it says otherwise): every test's browser, under its own playwright.use.
    use: { baseURL, trace: "retain-on-failure", ...deviceUse(config.device), ...use },
  };
}

/** A filter as the command line takes it: `/re/flags`, or a pattern matched in any case, as Playwright's `--grep` does. */
function pattern(text: string): RegExp {
  const literal = /^\/(.*)\/([gimsuy]*)$/.exec(text);
  return literal ? new RegExp(literal[1] ?? "", (literal[2] ?? "").replace("g", "")) : new RegExp(text, "i");
}

/** A device as Playwright's test options: size, pixel ratio, phone layout, touch. Nothing for the default (desktop). */
function deviceUse(device: Device | undefined): Record<string, unknown> {
  if (device === undefined) return {};
  const d = resolveDevice(device);
  return { viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch };
}
