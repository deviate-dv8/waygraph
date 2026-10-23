// `waygraph run <flow> --all-branches`: instead of the one path the live state picks, play every route through the
// flow's `.branch()` tree, each from a copy of the session at its branch point (or one shared session).
import type { MemPage } from "../../core/mem-page.js";
import type { Flow } from "../../core/flow.js";
import { branchRoutes, runBranchRegression } from "../../core/branch-regression.js";
import { extensionPathsFromEnv } from "../../runtime/browser.js";
import type { PlayOptions } from "../options.js";

export async function playBranches(flows: readonly Flow<any>[], mem: MemPage, options: PlayOptions): Promise<void> {
  const flow = flows.length === 1 ? flows[0]! : undefined;
  if (!flow) {
    console.error("waygraph run --all-branches: needs a single Flow reference (e.g. --blocks loginFlow), not a multi-segment chain spec - nothing else has one branch tree to explore.");
    process.exitCode = 1;
    return;
  }
  if (!branchRoutes(flow)) {
    console.error("waygraph run --all-branches: this Flow was not built with MapBuilder.branch() - there is no branch tree to explore. Run it normally instead.");
    process.exitCode = 1;
    return;
  }
  if (extensionPathsFromEnv().length > 0) {
    console.warn("waygraph run --all-branches: extensions are not loaded (branches run in cloned contexts)");
  }
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: !options.headed });
  try {
    const context = await browser.newContext(options.baseURL ? { baseURL: options.baseURL } : undefined);
    const results = await runBranchRegression(flow, context, mem, { cloneSession: !options.sharedSession });
    for (const r of results) {
      console.log(
        `waygraph run --all-branches: ${r.path || "(root)"} -> ${r.status}` +
          (r.result ? ` (${JSON.stringify(r.result)})` : "") +
          (r.error ? ` - ${r.error}` : ""),
      );
    }
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length) {
      console.error(`waygraph run --all-branches: ${failed.length}/${results.length} path(s) failed`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}
