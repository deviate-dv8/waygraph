// Real page network traffic -> the same network-tab overlay defineApiBlock's own calls use (see
// inpage/network.js's own header). Playwright's page.on('request'/'requestfinished') events cover
// every real request the PAGE makes (XHR/fetch/navigation) - not page.request.get()-style calls,
// which go through a separate APIRequestContext entirely and never touch the browser at all (that
// side is covered by defineApiBlock's own explicit addNetworkEntry call, in src/core/blocks/api.ts).
import { addNetworkEntry } from "./inpage/network.js";

// Fetch/XHR/navigation only - a real page can fire dozens of image/font/stylesheet requests per
// second, which would flood a panel meant to answer "what API calls did this page just make".
const RELEVANT_TYPES = new Set(["xhr", "fetch", "document"]);
// Response bodies this size or smaller, and only if they look text-ish, get captured for the
// detail view - a multi-MB image/video response has no business being buffered into page memory
// just because a demo happened to be running.
const MAX_BODY_BYTES = 200_000;

export function installNetworkCapture(page) {
  if (page.__wgNetworkCaptureInstalled) return;
  page.__wgNetworkCaptureInstalled = true;

  const startedAt = new Map();

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
      let resBody;
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
        request.allHeaders().catch(() => undefined),
        response.allHeaders().catch(() => undefined),
      ]);
      await page
        .evaluate(addNetworkEntry, {
          method: request.method(),
          url: request.url(),
          status: response.status(),
          ok: response.ok(),
          ms: start !== undefined ? Date.now() - start : undefined,
          reqHeaders,
          resHeaders,
          reqBody: request.postData() || undefined,
          resBody,
        })
        .catch(() => {});
    } catch {
      /* a capture failure must never break the actual run it's observing */
    }
  });

  page.on("requestfailed", (request) => {
    startedAt.delete(request);
    if (!RELEVANT_TYPES.has(request.resourceType())) return;
    page
      .evaluate(addNetworkEntry, {
        method: request.method(),
        url: request.url(),
        status: 0,
        ok: false,
        reqBody: request.postData() || undefined,
        resBody: request.failure() ? request.failure().errorText : undefined,
      })
      .catch(() => {});
  });
}
