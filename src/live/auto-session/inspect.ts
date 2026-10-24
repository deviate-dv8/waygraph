// What a session reads from its live page without changing it: the DOM (accessibility tree or full) and client
// state (storage, cookies, service workers). AutoSession's inspectDom / inspectStorage call these.
import type { BrowserContext, Page } from "@playwright/test";
import { showPilotActivity, showPilotVision } from "../../demo/overlay/pilot/shell.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import type { FullDomCaps, InspectDomOptions, InspectDomResult, StorageSnapshot } from "./helpers.js";
import { FULL_MODE_DEFAULT_DEPTH, FULL_MODE_MAX_NODES, FULL_MODE_MAX_TEXT_LENGTH, walkFullDom } from "./helpers.js";

export async function inspectDom(page: Page, opts: InspectDomOptions): Promise<InspectDomResult> {
  const mode = opts.mode ?? "aria";
  const ariaOptions = opts.depth !== undefined ? { mode: "ai" as const, depth: opts.depth } : { mode: "ai" as const };

  if (opts.selector) {
    const locator = page.locator(opts.selector).first();
    if ((await locator.count()) === 0) {
      return { ok: false, error: `no element matches selector "${opts.selector}"` };
    }
    await showPilotVision(page, opts.selector, `dom (${mode}): ${opts.selector}`, "orange");
    if (mode === "full") {
      const caps: FullDomCaps = {
        depth: opts.depth ?? FULL_MODE_DEFAULT_DEPTH,
        maxNodes: FULL_MODE_MAX_NODES,
        maxTextLength: FULL_MODE_MAX_TEXT_LENGTH,
      };
      const { tree, truncated } = await locator.evaluate(walkFullDom, caps);
      return { ok: true, snapshot: { mode: "full", selector: opts.selector, truncated, tree } };
    }
    const tree = await locator.ariaSnapshotJSON(ariaOptions);
    return { ok: true, snapshot: { mode: "aria", selector: opts.selector, truncated: false, tree } };
  }

  await showPilotActivity(page, `Running (Dom): ${mode}, whole page`);
  if (mode === "full") {
    // page.evaluate only ships the one function passed to it - it can't
    // reach another named function by closure. Routing the whole-page case
    // through the same `html` Locator lets both cases share one
    // self-contained walkFullDom instead of two near-duplicate callbacks.
    const caps: FullDomCaps = {
      depth: opts.depth ?? FULL_MODE_DEFAULT_DEPTH,
      maxNodes: FULL_MODE_MAX_NODES,
      maxTextLength: FULL_MODE_MAX_TEXT_LENGTH,
    };
    const { tree, truncated } = await page.locator("html").first().evaluate(walkFullDom, caps);
    return { ok: true, snapshot: { mode: "full", truncated, tree } };
  }
  const tree = await page.ariaSnapshotJSON(ariaOptions);
  return { ok: true, snapshot: { mode: "aria", truncated: false, tree } };
}

export async function inspectStorage(page: Page, context: BrowserContext): Promise<StorageSnapshot> {
  const [localStorageEntries, sessionStorageEntries] = await page.evaluate(() => [
    Object.entries(window.localStorage),
    Object.entries(window.sessionStorage),
  ]);
  const cookies = await context.cookies();
  const workers = context.serviceWorkers();
  const registrations = await page
    .evaluate(async () => {
      if (!("serviceWorker" in navigator)) return [];
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.map((r) => ({
        scope: r.scope,
        ...(r.active?.scriptURL ? { activeUrl: r.active.scriptURL } : {}),
        ...(r.active?.state ? { state: r.active.state } : {}),
      }));
    })
    .catch(ignorePageGone);
  return {
    localStorage: Object.fromEntries(localStorageEntries),
    sessionStorage: Object.fromEntries(sessionStorageEntries),
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      httpOnly: c.httpOnly,
      secure: c.secure,
    })),
    serviceWorkers: workers.map((w) => w.url()),
    serviceWorkerRegistrations: registrations ?? [],
  };
}
