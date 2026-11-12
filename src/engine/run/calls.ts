// The HTTP calls of a run, as data: each step's calls (the page's fetch/XHR, an API Block's request) become `step:call`
// events, and their bodies, with credentials masked, go to the run's artifacts. One recorder for one page and for panes.
import type { Page, Request } from "@playwright/test";
import { ignorePageGone } from "../page-gone.js";
import { maskBody, maskHeaders, routeOf } from "./call-words.js";
import { recordCall, runHandle, type CallSummary } from "./events.js";
import { realPage } from "./frame.js";

/** What a call said and was answered, for its artifact. */
export interface CallBodies {
  request: { headers?: Record<string, string> | undefined; body?: unknown };
  response: { status: number; headers?: Record<string, string> | undefined; body?: unknown };
}

type CallKeeper = (run: { runId: string; step: number }, n: number, bodies: CallBodies) => Promise<string | undefined>;
const KEEPER = Symbol.for("waygraph.callKeeper");
const keeperHolder = globalThis as unknown as Record<symbol, CallKeeper | undefined>;

/** Registers what keeps a call's bodies (the run log does): it returns where it wrote them. */
export function keepCalls(keeper: CallKeeper | undefined): void {
  keeperHolder[KEEPER] = keeper;
}

const RELEVANT = new Set(["xhr", "fetch"]);
/** A body above this isn't kept: a multi-MB download has no business in a run log. */
const MAX_BODY = 200_000;
const TEXTY = /json|text|xml|html|javascript|x-www-form-urlencoded/i;

const watched = new WeakSet<object>();
const counts = new Map<string, number>();

/** The app's origin, per run: the first page address a step saw. */
const appOrigins = new Map<string, string>();

/** Starts recording the calls `page` makes, for the run open now; once per page. */
export function watchCalls(page: Page, pane?: string): void {
  const run = runHandle();
  const real = realPage(page);
  if (!run || typeof real.on !== "function" || watched.has(real)) return;
  watched.add(real);
  const startedAt = new WeakMap<Request, number>();
  real.on("request", (req) => startedAt.set(req, Date.now()));
  real.on("requestfinished", (req) => {
    if (!RELEVANT.has(req.resourceType())) return;
    void guarded(() => finish(req, startedAt.get(req), run, pane));
  });
  real.on("requestfailed", (req) => {
    if (!RELEVANT.has(req.resourceType())) return;
    void settle(run, pane, req.url(), {
      source: "page", method: req.method(), url: req.url(), route: routeOf(req.url()), status: 0,
      ms: Date.now() - (startedAt.get(req) ?? Date.now()), failed: true,
    }, { request: { headers: maskHeaders(req.headers()), body: maskBody(req.postData() ?? undefined, req.headers()["content-type"]) }, response: { status: 0, body: req.failure()?.errorText } });
  });
}

/** A call that can't be recorded (the page closed under it) is still the page's call: nothing to report. */
async function guarded(record: () => Promise<void>): Promise<void> {
  try {
    await record();
  } catch {
    /* the page went away, or the body wasn't available */
  }
}

async function finish(req: Request, start: number | undefined, run: { runId: string; step: () => number }, pane: string | undefined): Promise<void> {
  const res = await req.response();
  if (!res) return;
  const headers = await res.allHeaders().catch(ignorePageGone);
  const type = headers?.["content-type"] ?? "";
  let text: string | undefined;
  let size: number | undefined;
  try {
    const buf = await res.body();
    size = buf.length;
    if (TEXTY.test(type) && buf.length <= MAX_BODY) text = buf.toString("utf8");
  } catch {
    /* redirected away, or not available: the call is still a call */
  }
  const reqHeaders = await req.allHeaders().catch(ignorePageGone);
  await settle(run, pane, req.url(), {
    source: "page", method: req.method(), url: req.url(), route: routeOf(req.url()), status: res.status(),
    ms: start !== undefined ? Date.now() - start : 0, failed: !res.ok(),
    ...(size !== undefined ? { size } : {}),
    ...(headers && (headers["etag"] || /max-age|immutable/.test(headers["cache-control"] ?? "")) ? { cacheable: true as const } : {}),
  }, {
    request: { headers: maskHeaders(reqHeaders), body: maskBody(req.postData() ?? undefined, reqHeaders?.["content-type"]) },
    response: { status: res.status(), headers: maskHeaders(headers), body: maskBody(text, type) },
  });
}

/** An API Block's own request, recorded with the step it ran in. */
export async function recordApiCallOf(call: { method: string; url: string; status: number; ok: boolean; ms: number; size?: number; reqHeaders?: Record<string, string>; reqBody?: string; resHeaders?: Record<string, string>; resBody?: string }): Promise<void> {
  const run = runHandle();
  if (!run) return;
  const reqType = call.reqHeaders?.["content-type"] ?? (call.reqBody?.trimStart().startsWith("{") ? "application/json" : "");
  const resType = call.resHeaders?.["content-type"] ?? "";
  await settle(run, undefined, call.url, {
    source: "api", method: call.method.toUpperCase(), url: call.url, route: routeOf(call.url), status: call.status, ms: call.ms, failed: !call.ok,
    ...(call.size !== undefined ? { size: call.size } : {}),
  }, {
    request: { headers: maskHeaders(call.reqHeaders), body: maskBody(call.reqBody, reqType) },
    response: { status: call.status, headers: maskHeaders(call.resHeaders), body: maskBody(call.resBody, resType) },
  });
}

async function settle(run: { runId: string; step: () => number }, pane: string | undefined, url: string, summary: CallSummary, bodies: CallBodies): Promise<void> {
  const step = run.step();
  const origin = originOf(url);
  const app = appOrigins.get(run.runId) ?? (summary.source === "page" && origin ? origin : undefined);
  if (app && !appOrigins.has(run.runId)) appOrigins.set(run.runId, app);
  const n = (counts.get(`${run.runId}:${step}`) ?? 0) + 1;
  counts.set(`${run.runId}:${step}`, n);
  let body: string | undefined;
  try {
    body = await keeperHolder[KEEPER]?.({ runId: run.runId, step }, n, bodies);
  } catch {
    /* a call that can't be kept is still a call */
  }
  recordCall(run.runId, step, {
    ...summary,
    ...(summary.source === "page" && app && origin !== app ? { external: true as const } : {}),
    ...(pane ? { pane } : {}),
    ...(body ? { body } : {}),
  });
}

const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};
