// Loaded by `waygraph test` (playwright test -c) for projects that keep their settings in config/waygraph.config.ts.
import { defineConfig } from "@playwright/test";
import { loadWaygraphConfig, resolveBaseUrl } from "./config.js";
import { playwrightConfigFrom } from "./playwright-config.js";

const projectDir = process.env.WAYGRAPH_PROJECT_DIR ?? process.cwd();

export default defineConfig(playwrightConfigFrom((await loadWaygraphConfig(projectDir)) ?? {}, projectDir, await resolveBaseUrl(projectDir)));
