// Regression coverage for MapBuilder.branch(): a live run only ever takes ONE path through a
// branch tree, decided by real page/mem state. seedMemStub already fixes the mem half of "cover
// every branch" (it walks Flow.blocks(), which recurses into every branch - see map-builder.spec.ts).
// This file covers the other half: actually RUNNING a branch's own blocks, independent of whether
// a live dispatch would currently reach them.
//
// The real constraint that makes this only sometimes possible: a branch usually assumes a page
// state its own blocks never produce (e.g. "already logged in," reached by the PREFIX before the
// branch, not by this branch's own blocks). Such a branch can't be run standalone - there's no URL
// that recreates "you just submitted the login form." Only a branch whose OWN first Block navigates
// (a nav/page Block) is self-contained enough to run in isolation. `collectBranchFlows` reports
// every branch either way; `runBranchRegression` runs the navigable ones and SKIPS the rest with a
// clear reason instead of producing a confusing, misleading failure.
import type { Checkpoint } from "../types.js";
import type { Flow } from "./flow.js";
import type { RunGraphOptions } from "./run-graph.js";
import { MemPage } from "../mem-page.js";
import { seedMemStub } from "../mem-stub.js";
import type { BrowserContext } from "@playwright/test";

/** One branch reachable from `flow`, possibly several `.branch()` levels deep. */
export interface BranchEntry {
  /** `"Away"`, or `"Away > Far"` for a nested branch - the route tags that lead here, in order. */
  path: string;
  flow: Flow<any>;
}

/** This Flow's own immediate `.branch()` routes, or `undefined` if it wasn't built by `.branch()`. */
export function branchRoutes(flow: Flow<any>): ReadonlyMap<string, Flow<any> | null> | undefined {
  const routes = (flow as { __wgBranchRoutes?: Record<string, Flow<any> | null> }).__wgBranchRoutes;
  return routes ? new Map(Object.entries(routes)) : undefined;
}

/**
 * Every branch Flow reachable from `flow`, at any depth, deduped by object identity (the same
 * route Flow reused under two tags is only listed once). Doesn't include `flow` itself - only its
 * `.branch()` continuations.
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

/** Why a branch was skipped instead of run. */
export type BranchSkipReason =
  | "first Block is not nav/page - this branch needs page state a live run would have reached through its prefix, not its own blocks";
export interface BranchRunResult {
  path: string;
  status: "ok" | "failed" | "skipped";
  result?: Checkpoint<string>;
  error?: string;
  reason?: BranchSkipReason;
}

/**
 * Runs every independently-enterable branch of `flow` (one whose own first Block navigates), each
 * with a fresh `MemPage` seeded via {@link seedMemStub} and a fresh page. Branches that assume
 * prior page state (first Block isn't nav/page) are reported as `"skipped"`, not silently run into
 * a confusing failure - see this file's own header for why that's a real, unavoidable limit, not a
 * gap to code around.
 * @example
 * for (const r of await runBranchRegression(loginFlow, context)) {
 *   console.log(r.path, r.status, r.error ?? r.reason ?? "");
 * }
 */
export async function runBranchRegression(
  flow: Flow<any>,
  context: BrowserContext,
  options?: RunGraphOptions,
): Promise<BranchRunResult[]> {
  const entries = collectBranchFlows(flow);
  const results: BranchRunResult[] = [];
  for (const entry of entries) {
    const first = entry.flow.blocks()[0]?.block as { __waygraphKind?: string } | undefined;
    const kind = first?.__waygraphKind;
    if (kind !== "nav" && kind !== "page") {
      results.push({
        path: entry.path,
        status: "skipped",
        reason:
          "first Block is not nav/page - this branch needs page state a live run would have reached through its prefix, not its own blocks",
      });
      continue;
    }
    const mem = new MemPage();
    seedMemStub(mem, entry.flow);
    try {
      const result = await entry.flow.run(context, mem, { ...options, closeOnFinish: true });
      results.push({ path: entry.path, status: "ok", result: result as Checkpoint<string> });
    } catch (err) {
      results.push({
        path: entry.path,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
