// What a run's HTTP calls say about a page: the same GET twice, one route asked for with many ids (N+1), a slow or large
// answer, a call the page made that failed, too many calls to arrive. Pure over the run log's events, so the command and
// Waygraph Studio say the same.
import type { RunEvent } from "../engine/run/events.js";

export type NetworkFindingKind = "duplicate" | "n+1" | "slow" | "large" | "uncached" | "chatty" | "failed";

export interface NetworkFinding {
  kind: NetworkFindingKind;
  /** The page (Checkpoint) the step that made the calls landed on. */
  page: string;
  step: number;
  /** `GET /posts/:id`, or `20 calls` for a chatty page. */
  what: string;
  detail: string;
}

/** The limits a finding needs; `demo.network.thresholds` in the config can move them. */
export interface NetworkThresholds {
  slowMs: number;
  largeBytes: number;
  chattyCalls: number;
  nPlusOne: number;
}
export const DEFAULT_THRESHOLDS: NetworkThresholds = { slowMs: 1000, largeBytes: 100_000, chattyCalls: 20, nPlusOne: 5 };

type Call = Extract<RunEvent, { type: "step:call" }>;

/** Findings for every step of a run that made calls, worst kinds first within a step. Other origins' calls are left out. */
export function networkFindings(events: readonly RunEvent[], limits: Partial<NetworkThresholds> = {}): NetworkFinding[] {
  const t = { ...DEFAULT_THRESHOLDS, ...limits };
  const landed = new Map<number, string>();
  for (const e of events) if (e.type === "step:end") landed.set(e.index, e.to);
  const byStep = new Map<number, Call[]>();
  for (const e of events) {
    if (e.type !== "step:call" || e.external) continue;
    byStep.set(e.index, [...(byStep.get(e.index) ?? []), e]);
  }
  const out: NetworkFinding[] = [];
  for (const [step, calls] of byStep) {
    const page = landed.get(step) ?? "?";
    const add = (kind: NetworkFindingKind, what: string, detail: string) => out.push({ kind, page, step, what, detail });
    if (calls.length > t.chattyCalls) add("chatty", `${calls.length} calls`, `more than ${t.chattyCalls} calls in one step: batch them, or load less up front`);
    const gets = calls.filter((c) => c.method === "GET");
    const seen = new Map<string, number>();
    for (const c of gets) seen.set(c.url, (seen.get(c.url) ?? 0) + 1);
    for (const [url, n] of seen) {
      if (n > 1) add("duplicate", `GET ${gets.find((c) => c.url === url)?.route ?? url}`, `asked ${n} times for the same address in one step: ask once and share the answer`);
    }
    const routes = new Map<string, Set<string>>();
    for (const c of gets) routes.set(c.route, (routes.get(c.route) ?? new Set()).add(c.url));
    for (const [route, urls] of routes) {
      if (urls.size >= t.nPlusOne && route.includes(":id")) add("n+1", `GET ${route}`, `${urls.size} calls to the same route with different ids: one call that takes the list would do`);
    }
    for (const c of calls) {
      const name = `${c.method} ${c.route}`;
      if (c.ms > t.slowMs) add("slow", name, `took ${c.ms} ms`);
      if (c.size !== undefined && c.size > t.largeBytes) add("large", name, `${Math.round(c.size / 1024)} KB answer: page it, or send only the fields the page uses`);
      if (c.failed) add("failed", name, `answered ${c.status || "nothing"}`);
    }
    for (const c of gets) {
      if (c.source === "page" && !c.failed && !c.cacheable && c.size !== undefined && c.size > 10_000 && !out.some((f) => f.kind === "uncached" && f.step === step && f.what === `GET ${c.route}`)) {
        add("uncached", `GET ${c.route}`, "no etag or cache-control: the browser asks for all of it again every visit");
      }
    }
  }
  return out;
}
