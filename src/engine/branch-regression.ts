// Regression coverage for MapBuilder.branch(): a live run only ever takes ONE path through a
// branch tree, decided by real page/mem state. `runBranchRegression` explores every path for real,
// not just once - it clones the actual browser session (cookies/localStorage + the current page's
// URL, via Playwright's own storageState) right at each branch point, so every route gets to run
// from a genuine copy of the state a live run would have reached there - not a fresh, unauthenticated
// page. One branch finishing never consumes the others' chance to run: each gets its own clone from
// the SAME snapshot, so "one branch is done, come back and try the next" is the default, not
// something you opt into.
//
// `cloneSession: false` opts out to a single shared session instead - the ordinary `flow.run()`
// behavior, one real dispatch down whichever path the live state actually takes. Useful as a
// baseline, but it cannot explore siblings: once a branch's Blocks run, the page has moved on.
import type { Checkpoint } from "../types.js";
import type { Flow } from "./flow.js";
import type { RunGraphOptions } from "./run-graph.js";
import { MemPage } from "../mem-page.js";
import { seedMemStub } from "../mem-stub.js";
import type { Browser, BrowserContext, Page } from "@playwright/test";

/** One branch reachable from `flow`, possibly several `.branch()` levels deep. */
export interface BranchEntry {
  /** `"Away"`, or `"Away > Far"` for a nested branch - the route tags that lead here, in order. */
  path: string;
  flow: Flow<any>;
}

interface BranchInfo {
  before: Flow<any>;
  routes: Record<string, Flow<any> | null>;
}

function branchInfo(flow: Flow<any>): BranchInfo | undefined {
  return (flow as { __wgBranch?: BranchInfo }).__wgBranch;
}

/** This Flow's own immediate `.branch()` routes, or `undefined` if it wasn't built by `.branch()`. */
export function branchRoutes(flow: Flow<any>): ReadonlyMap<string, Flow<any> | null> | undefined {
  const info = branchInfo(flow);
  return info ? new Map(Object.entries(info.routes)) : undefined;
}

/**
 * Every branch Flow reachable from `flow`, at any depth, deduped by object identity (the same
 * route Flow reused under two tags is only listed once). Doesn't include `flow` itself - only its
 * `.branch()` continuations. Static - doesn't run anything.
 */
export function collectBranchFlows(flow: Flow<any>): BranchEntry[] {
  const out: BranchEntry[] = [];
  const seen = new Set<Flow<any>>();
  const walk = (f: Flow<any>, prefix: string): void => {
    const routes = branchRoutes(f);
    if (!routes) return;
    for (const [tag, route] of routes) {
      if (!route || seen.has(route)) continue;
      seen.add(route);
      const path = prefix ? `${prefix} > ${tag}` : tag;
      out.push({ path, flow: route });
      walk(route, path);
    }
  };
  walk(flow, "");
  return out;
}

export interface BranchRunResult {
  path: string;
  status: "ok" | "failed";
  result?: Checkpoint<string>;
  error?: string;
}

export interface RunBranchRegressionOptions extends RunGraphOptions {
  /**
   * Default `true`: clone the real session (storageState + current URL) at every branch point, so
   * every route runs from a genuine copy of the live state, not a fresh page. `false` runs the
   * whole tree exactly once, through whichever single path the live state actually takes (same as
   * calling `flow.run()` directly) - can't explore siblings, since the one real page has moved on
   * once a branch's Blocks run.
   */
  cloneSession?: boolean;
}

/**
 * Runs every path through `flow`'s `.branch()` tree - by default in a CLONED session per branch
 * point (see this file's own header), so one branch finishing doesn't consume another's chance to
 * run. Each explored branch gets its own `MemPage` (via {@link MemPage.clone}, seeded further with
 * {@link seedMemStub} for anything a route alone requires that the shared prefix didn't already set).
 * @example
 * for (const r of await runBranchRegression(loginFlow, context)) {
 *   console.log(r.path, r.status, r.error ?? "");
 * }
 */
export async function runBranchRegression(
  flow: Flow<any>,
  context: BrowserContext,
  mem: MemPage = new MemPage(),
  options?: RunBranchRegressionOptions,
): Promise<BranchRunResult[]> {
  const cloneSession = options?.cloneSession ?? true;
  const results: BranchRunResult[] = [];
  const browser: Browser | null = cloneSession ? context.browser() : null;
  if (cloneSession && !browser) {
    throw new Error(
      "Waygraph runBranchRegression: cloneSession needs context.browser() (a persistent context " +
        "has none) - pass { cloneSession: false } to run the single live path in this context instead.",
    );
  }

  /** `entryPage`, when given, is already positioned (cloned session + navigated) - reused as-is,
   *  never replaced by a fresh `ctx.newPage()` (that would throw away the whole point of cloning). */
  async function walk(f: Flow<any>, ctx: BrowserContext, m: MemPage, path: string, entryPage?: Page): Promise<void> {
    const info = branchInfo(f);
    if (!info) {
      // Leaf: whatever Blocks this route itself adds - run them to completion from the (possibly
      // cloned, already-positioned) session already in place.
      seedMemStub(m, f);
      const page = entryPage ?? (await ctx.newPage());
      try {
        const result = await f.run(ctx, m, { ...options, page, closeOnFinish: true });
        results.push({ path, status: "ok", result: result as Checkpoint<string> });
      } catch (err) {
        results.push({ path, status: "failed", error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    seedMemStub(m, info.before);
    const page = entryPage ?? (await ctx.newPage());
    let first: { result: Checkpoint<string>; page: Page };
    try {
      first = (await info.before.run(ctx, m, { ...options, page, closeOnFinish: false })) as {
        result: Checkpoint<string>;
        page: Page;
      };
    } catch (err) {
      results.push({ path, status: "failed", error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!cloneSession) {
      // Shared-session mode: only the ONE route the live state actually resolved to is reachable -
      // the page has already moved past every other tag.
      const route = info.routes[first.result.__state];
      const tagPath = path ? `${path} > ${first.result.__state}` : first.result.__state;
      if (!route) {
        results.push({ path: tagPath, status: "ok", result: first.result });
        return;
      }
      await walk(route, ctx, m, tagPath, first.page);
      return;
    }
    const url = first.page.url();
    const storageState = await ctx.storageState();
    await first.page.close();
    for (const [tag, route] of Object.entries(info.routes)) {
      const branchPath = path ? `${path} > ${tag}` : tag;
      if (!route) {
        results.push({ path: branchPath, status: "ok", result: { __state: tag } as Checkpoint<string> });
        continue;
      }
      const branchContext = await browser!.newContext({ storageState });
      try {
        const branchPage = await branchContext.newPage();
        // Best-effort: land back on the same page the prefix ended on before this route's own
        // Blocks run - restores cookies/localStorage AND which page was loaded, not just auth state.
        await branchPage.goto(url).catch(() => {});
        await walk(route, branchContext, m.clone(), branchPath, branchPage);
      } finally {
        await branchContext.close();
      }
    }
  }

  await walk(flow, context, mem, "");
  return results;
}
