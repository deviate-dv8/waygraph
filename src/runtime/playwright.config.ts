// Loaded by `waygraph test` (playwright test -c) for projects that keep their settings in config/waygraph.config.ts.
import { defineConfig } from "@playwright/test";
import { loadWaygraphConfig, resolveBaseUrl } from "./waygraph-config.js";
import { playwrightConfigFrom } from "./playwright-config.js";
import { envFlag, envString } from "../engine/env.js";

const projectDir = envString("WAYGRAPH_PROJECT_DIR") ?? process.cwd();

export default defineConfig(
  playwrightConfigFrom((await loadWaygraphConfig(projectDir)) ?? {}, projectDir, await resolveBaseUrl(projectDir), envFlag("WAYGRAPH_FLOW_TESTS")),
);
