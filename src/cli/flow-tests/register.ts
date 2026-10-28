// `waygraph test --flows`: every flow the project exports is a Playwright test, so parallel workers, retries, video,
// traces and the HTML / JSON reports come from Playwright with nothing to write. Loaded by flows.spec.ts (every flow
// but the exclusive ones, in parallel) and flows-exclusive.spec.ts (map({ exclusive: true }) flows, one at a time,
// after the rest - see runtime/playwright-config.ts).
import { test } from "@playwright/test";
import { relative } from "node:path";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import { envString } from "../../engine/env.js";
import type { Flow } from "../../engine/flow/flow.js";
import { MemPage } from "../../engine/mem/mem.js";
import { seedMemStub } from "../../engine/mem/mem-stub.js";
import { importFresh, isFlowLike, walkDir } from "../../manifest/scan.js";
import { installRunLog } from "../../runtime/run-log.js";

/** The keys a flow needs that nothing will give it in a test (no mem stub): it is skipped, saying which. */
function unsupplied(flow: Flow<Checkpoint<string>>, mem: MemPage): string[] {
  const names = new Set<string>();
  for (const info of flow.blocks()) for (const k of info.block.requires ?? []) if (!mem.has(k)) names.add(k.name);
  return [...names];
}

/**
 * Whether a flow opens its own page, so it can run on its own: its first step navigates by URL, signs an account in,
 * or calls an API (a fast-forward step: its own first step). A flow that starts on a page it doesn't open is an episode
 * that runs after another flow (in a chain, or nested with `.flow()`).
 */
function opensItsPage(block: object): boolean {
  const b = block as {
    name: string;
    __waygraphKind?: string;
    __waygraphNavClick?: unknown;
    __waygraphPageDeepLink?: boolean;
    steps?: () => { block: object }[];
  };
  // A Nav goes by URL or by a click; a Page hub navigates when it has either. The URL may be a function of mem.
  const navigates = b.__waygraphKind === "nav" || (b.__waygraphKind === "page" && b.__waygraphPageDeepLink === true);
  if ((navigates && b.__waygraphNavClick === undefined) || b.__waygraphKind === "api" || b.name.startsWith("sign-in-as-")) return true;
  const inner = typeof b.steps === "function" ? b.steps()[0] : undefined;
  return inner ? opensItsPage(inner.block) : false;
}

/** An export that runs and lists its Blocks: a flow `map()` built. */
function isFlow(value: unknown): value is Flow<Checkpoint<string>> {
  return isFlowLike(value);
}

/** Registers one test per exported flow: the exclusive ones, or every other one. */
export async function registerFlowTests(exclusive: boolean): Promise<void> {
  installRunLog();
  const projectDir = envString("WAYGRAPH_PROJECT_DIR") ?? process.cwd();
  for (const file of walkDir(projectDir, /\.flow\.ts$/)) {
    const mod = await importFresh(file);
    for (const [exportName, value] of Object.entries(mod)) {
      if (!isFlow(value)) continue;
      const flow = value;
      if ((flow.exclusive === true) !== exclusive) continue;
      test(`${relative(projectDir, file)} › ${exportName}`, async ({ page, context }) => {
        const first = flow.blocks()[0];
        test.skip(!!first && !opensItsPage(first.block), `starts on a page it doesn't open (${first?.name}): it runs after another flow - chain it, or start it with a gotoPage`);
        const mem = new MemPage();
        if (flow.memStub) seedMemStub(mem, flow);
        const missing = unsupplied(flow, mem);
        test.skip(missing.length > 0, `needs ${missing.join(", ")}: register a mem stub (and map({ memStub: true })), or run it with --data`);
        if (flow.viewport) await page.setViewportSize(flow.viewport);
        if (flow.expectedFailureReason) {
          // Meant to fail (map({ expectedFailure })): ending on its failure branch or throwing both pass.
          try {
            await flow.run(context, mem, { page });
          } catch {
            test.info().annotations.push({ type: "expected failure", description: flow.expectedFailureReason });
          }
          return;
        }
        await flow.run(context, mem, { page });
      });
    }
  }
}
