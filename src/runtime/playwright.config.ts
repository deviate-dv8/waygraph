// Loaded by `waygraph test` (playwright test -c) for projects that keep their settings in config/waygraph.config.ts.
import { defineConfig } from "@playwright/test";
import { loadWaygraphConfig, resolveBaseUrl } from "./waygraph-config.js";
import { playwrightConfigFrom } from "./playwright-config.js";
import { envFlag, envString } from "../engine/env.js";
import { loadMemStubs } from "../manifest/project.js";
import { loadReadBlocks } from "../manifest/read-blocks.js";

const projectDir = envString("WAYGRAPH_PROJECT_DIR") ?? process.cwd();
// Every test process loads the config: the project's mem stubs and Read Blocks register here, for its own specs and its
// flows alike (a verify or expect that checks what a page shows reads it through them, as in a run).
await loadMemStubs(projectDir);
await loadReadBlocks(projectDir);

export default defineConfig(
  playwrightConfigFrom((await loadWaygraphConfig(projectDir)) ?? {}, projectDir, await resolveBaseUrl(projectDir), envFlag("WAYGRAPH_FLOW_TESTS")),
);
