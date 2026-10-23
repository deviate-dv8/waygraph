import { setOwnContextLauncher } from "../core/launch.js";
import type { EngineConfig } from "../core/config.js";
import { resolveLauncher } from "../core/config.js";
import { chromiumExecutablePath, extensionPathsFromEnv, launchContext } from "./browser.js";
import { resolveExtensions } from "./extensions.js";
import { loadWaygraphConfig } from "./config.js";

// An Engine's own browser follows the selected config (--config), the Chromium override and the configured extensions.
setOwnContextLauncher(async (engineConfig: EngineConfig | undefined) => {
  // A config chosen with `--config` / WAYGRAPH_CONFIG wins over the one the Engine was built with.
  const chosen = process.env.WAYGRAPH_CONFIG ? await loadWaygraphConfig(process.cwd()) : undefined;
  const config: EngineConfig | undefined = chosen
    ? {
        ...engineConfig,
        ...(chosen.baseUrl !== undefined ? { baseUrl: chosen.baseUrl } : {}),
        ...(chosen.extensions !== undefined ? { extensions: chosen.extensions } : {}),
      }
    : engineConfig;
  const browserName = config?.browserName ?? "chromium";
  const executablePath = browserName === "chromium" ? chromiumExecutablePath() : undefined;
  const baseURL = config?.baseUrl ?? process.env.WAYGRAPH_BASE_URL;
  return launchContext({
    launcher: resolveLauncher(browserName, config),
    launch: {
      headless: config?.headless ?? true,
      ...(config?.slowMo !== undefined ? { slowMo: config.slowMo } : {}),
      ...(executablePath ? { executablePath } : {}),
    },
    context: {
      ...(baseURL ? { baseURL } : {}),
      ...(config?.recordVideo ? { recordVideo: config.recordVideo } : {}),
    },
    extensions: await resolveExtensions(config?.extensions ?? extensionPathsFromEnv(), process.cwd()),
  });
});
