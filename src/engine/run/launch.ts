// How a Flow opens its own browser when run(mem) gets none; runtime/ registers the full launcher (extensions, CHROME_PATH).
import type { BrowserContext } from "@playwright/test";
import { resolveLauncher } from "../config.js";
import type { EngineConfig } from "../config.js";
import { envString } from "../env.js";

/** A browser context an Engine opened for itself, and how to close it again. */
export interface OwnContext {
  context: BrowserContext;
  close(): Promise<void>;
}

type OwnContextLauncher = (config: EngineConfig | undefined) => Promise<OwnContext>;

/** Plain Playwright launch: what an Engine does when nothing richer is registered (no config file, no extensions). */
async function plainLaunch(config: EngineConfig | undefined): Promise<OwnContext> {
  if (config?.extensions?.length) {
    throw new Error('waygraph: browser extensions need the runtime layer - import the Engine from "waygraph"');
  }
  const browser = await (await resolveLauncher(config?.browserName ?? "chromium", config)).launch({
    headless: config?.headless ?? true,
    ...(config?.slowMo !== undefined ? { slowMo: config.slowMo } : {}),
  });
  const baseURL = config?.baseUrl ?? envString("WAYGRAPH_BASE_URL");
  const context = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    ...(config?.recordVideo ? { recordVideo: config.recordVideo } : {}),
  });
  return { context, close: () => browser.close() };
}

let launcher: OwnContextLauncher = plainLaunch;

/** The runtime layer registers the full launch (selected config, Chromium path, extensions); see `runtime/full-launch.ts`. */
export function setOwnContextLauncher(next: OwnContextLauncher): void {
  launcher = next;
}

/** Opens the browser and context a `Flow.run(mem)` uses when the caller gave none. */
export function launchOwnContext(config: EngineConfig | undefined): Promise<OwnContext> {
  return launcher(config);
}
