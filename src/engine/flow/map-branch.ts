// The Flow `MapBuilder.branch()` returns: run the steps before, then the route for the Checkpoint they landed on.
import type { BrowserContext, Page } from "@playwright/test";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { EngineConfig } from "../config.js";
import { MSG_MAP_BRANCH_SHARED_SESSION_UNSUPPORTED, WaygraphError } from "../errors.js";
import { MemPage } from "../mem/mem.js";
import type { RunGraphOptions } from "../run/run.js";
import type { Flow } from "./flow.js";


/**
 * Builds the `Flow` object `MapBuilder.branch()` returns: run `before`, then dispatch on the
 * resolved tag into whichever `routes` entry matches (same page/context/mem), or return that
 * Checkpoint as-is when its route is `null`. Factored out so `withBlockVerify`/`modBlockVerify`
 * can patch `before` and rebuild the same branched shape, exactly like a plain Flow's own.
 */
export function buildBranchedFlow<Out extends Checkpoint<string>>(
  before: Flow<Out>,
  routes: Record<string, Flow<Checkpoint<string>> | null>): Flow<Checkpoint<string>> {
  const run = (async (
    contextOrMem: BrowserContext | MemPage,
    memOrConfig?: MemPage | EngineConfig,
    options?: RunGraphOptions
  ) => {
    if (contextOrMem instanceof MemPage) {
      throw new WaygraphError("WG_MAP_BRANCH_SHARED_SESSION_UNSUPPORTED", MSG_MAP_BRANCH_SHARED_SESSION_UNSUPPORTED);
    }
    const context = contextOrMem;
    const mem = memOrConfig as MemPage;
    const gotOwnPage = options?.page === undefined;
    const page = options?.page ?? (await context.newPage());
    const closeOnFinish = options?.closeOnFinish ?? gotOwnPage;
    const first = (await before.run(context, mem, { ...options, page, closeOnFinish: false })) as {
      result: Out;
      page: Page;
    };
    const branchFlow = routes[first.result.__state];
    if (!branchFlow) {
      if (options?.closeOnFinish === false) return { result: first.result, page: first.page };
      if (closeOnFinish) await first.page.close();
      return first.result;
    }
    return branchFlow.run(context, mem, { ...options, page: first.page, closeOnFinish });
  }) as Flow<Checkpoint<string>>["run"];
  return {
    resetSession: before.resetSession,
    config: before.config,
    ...(before.expectedFailureReason !== undefined ? { expectedFailureReason: before.expectedFailureReason } : {}),
    ...(before.demoPace !== undefined ? { demoPace: before.demoPace } : {}),
    ...(before.highlightStyle !== undefined ? { highlightStyle: before.highlightStyle } : {}),
    ...(before.memStub !== undefined ? { memStub: before.memStub } : {}),
    // Read by branchRoutes()/branchInfo() (branch-regression.ts) - real, ORDINARY (enumerable)
    // properties, not hidden ones, specifically so a `{ ...flow, ... }` spread (withSettings) carries them
    // through instead of silently dropping them -
    // the same class of bug branch()'s missing copyWaygraphRuntime call already was.
    __wgBranch: { before, routes },
    // Static introspection (`waygraph graph`/list): the fixed prefix, plus every branch's own
    // Blocks prefixed by the tag that leads to them - can't know at analysis time which one a real
    // run takes, so this shows all of them rather than none.
    blocks: () => [
      ...before.blocks(),
      ...Object.entries(routes).flatMap(([tag, f]) => f ? f.blocks().map((b) => ({ ...b, name: `${tag} -> ${b.name}` })) : []
      ),
    ],
    run,
    withBlockVerify(block, verify) {
      return buildBranchedFlow(before.withBlockVerify(block, verify), routes);
    },
    modBlockVerify(block, nameOrIndex, newCheck) {
      return buildBranchedFlow(before.modBlockVerify(block, nameOrIndex, newCheck), routes);
    },
  } as Flow<Checkpoint<string>>;
}
