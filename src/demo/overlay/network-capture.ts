// Real page network traffic -> the same network-tab overlay defineApiBlock's own calls use (see
// inpage/network.ts's own header). Playwright's page.on('request'/'requestfinished') events cover
// every real request the PAGE makes (XHR/fetch/navigation) - not page.request.get()-style calls,
// which go through a separate APIRequestContext entirely and never touch the browser at all (that
// side is covered by defineApiBlock's own explicit call, in src/engine/block/kinds/api.ts).
import type { Request } from "@playwright/test";
import type { NetworkEntry, WgPage } from "../types.js";
import { addNetworkEntry, clearNetworkLog } from "./inpage/network.js";
import { setApiCallRecorder } from "../../engine/run/hooks.js";
import { ignorePageGone } from "../../engine/page-gone.js";

// Fetch/XHR/navigation only - a real page can fire dozens of image/font/stylesheet requests per
// second, which would flood a panel meant to answer "what API calls did this page just made".
const RELEVANT_TYPES = new Set(["xhr", "fetch", "document"]);
// Response bodies this size or smaller, and only if they look text-ish, get captured for the
// detail view - a multi-MB image/video response has no business being buffered into page memory
// just because a demo happened to be running.
const MAX_BODY_BYTES = 200_000;
// Matches the in-page addNetworkEntry's own cap (network.js) - the Node-side history this backs
// stays in sync with what the panel can actually show.
const MAX_HISTORY = 30;

/**
 * Records one entry AND paints it live - the single place that touches page.__wgNetworkHistory,
 * so every caller (this file's own listeners, defineApiBlock) stays in sync automatically. History
 * lives on the Playwright `Page` object (Node side), which survives navigation - the panel DOM
 * (page side, inside the shadow root) does not, and gets wiped on every real navigation. Without
 * this, the "network tab" reset to empty on every step that navigated - not what a persistent
 * Network tab is supposed to do.
 */
export function recordNetworkEntry(page: WgPage, entry: NetworkEntry) {
  page.__wgNetworkHistory = page.__wgNetworkHistory || [];
  page.__wgNetworkHistory.push(entry);
  while (page.__wgNetworkHistory.length > MAX_HISTORY) page.__wgNetworkHistory.shift();
  return page.evaluate(addNetworkEntry, entry).catch(ignorePageGone);
}

/**
 * Replays whatever history survived the last navigation back into a freshly (re)installed panel -
 * call this after ensureShadowRoot, every step, same as the rest of the overlay's own per-step
 * resync (banner/todos/device), and BEFORE that step's own network activity can add anything new
 * (installOverlay runs at the very start of a step, so this is always true in practice - no
 * interleaving race between "replay old" and "record new" to reason about). A no-op when there's
 * no history yet, or the panel already shows exactly as many entries as history has (nothing was
 * wiped this step). Otherwise clears and rebuilds from scratch, in order - simpler and more
 * obviously correct than trying to diff/append just the "missing" ones.
 */
export async function restoreNetworkHistory(page: WgPage) {
  const history = page.__wgNetworkHistory;
  if (!history || history.length === 0) return;
  // page.__wgNetworkNeedsRestore is set by installNetworkCapture's own framenavigated listener -
  // skip the page.evaluate() round-trip entirely (an extra one on EVERY step otherwise, since this
  // runs from installOverlay every step) unless a real navigation actually happened since the last
  // successful restore. A real, caught perf regression: this used to always evaluate() a shown-count
  // check first, which measurably slowed down every step of every test that had ever captured any
  // traffic at all, not just ones that navigate.
  if (!page.__wgNetworkNeedsRestore) return;
  page.__wgNetworkNeedsRestore = false;
  await page.evaluate(clearNetworkLog).catch(ignorePageGone);
  for (const entry of history) {
    await page.evaluate(addNetworkEntry, entry).catch(ignorePageGone);
  }
}

export function installNetworkCapture(page: WgPage) {
  // defineApiBlock reports its calls through the engine's hook; show them in the same panel.
  setApiCallRecorder((p, entry) => recordNetworkEntry(p, entry));
  if (page.__wgNetworkCaptureInstalled) return;
  page.__wgNetworkCaptureInstalled = true;

  // Marks history as needing a replay - see restoreNetworkHistory's own comment. Main frame only;
  // an iframe navigating doesn't wipe the top-level shadow root the panel lives in.
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) page.__wgNetworkNeedsRestore = true;
  });

  const startedAt = new Map<Request, number>();

  page.on("request", (request) => {
    startedAt.set(request, Date.now());
  });

  page.on("requestfinished", async (request) => {
    try {
      if (!RELEVANT_TYPES.has(request.resourceType())) return;
      const response = await request.response();
      if (!response) return;
      const start = startedAt.get(request);
      startedAt.delete(request);
      let resBody: string | undefined;
      try {
        const contentType = (await response.headerValue("content-type")) || "";
        if (/json|text|xml|html|javascript/.test(contentType)) {
          const buf = await response.body();
          if (buf.length <= MAX_BODY_BYTES) resBody = buf.toString("utf8");
        }
      } catch {
        /* body already consumed / redirected away / not available - best-effort only */
      }
      const [reqHeaders, resHeaders] = await Promise.all([
        request.allHeaders().catch(ignorePageGone),
        response.allHeaders().catch(ignorePageGone),
      ]);
      await recordNetworkEntry(page, {
        method: request.method(),
        url: request.url(),
        status: response.status(),
        ok: response.ok(),
        ms: start !== undefined ? Date.now() - start : undefined,
        reqHeaders,
        resHeaders,
        reqBody: request.postData() || undefined,
        resBody,
      });
    } catch {
      /* a capture failure must never break the actual run it's observing */
    }
  });

  page.on("requestfailed", (request) => {
    startedAt.delete(request);
    if (!RELEVANT_TYPES.has(request.resourceType())) return;
    recordNetworkEntry(page, {
      method: request.method(),
      url: request.url(),
      status: 0,
      ok: false,
      reqBody: request.postData() || undefined,
      resBody: request.failure()?.errorText,
    });
  });
}

