// The app's own API, as a page's read can ask it: what a page only shows after a reload (a status the backend already
// changed, a file that is ready) is read from the API with the page's own session. The project says once where the API is
// and how a request is signed (`new Engine({ api: { baseUrl, headers } })`); every `ctx.page.api(...)` uses it.
import type { Page } from "@playwright/test";

export interface PageApi {
  /** Where the API is (`http://localhost:3091`). */
  baseUrl: string;
  /** What signs a request, from the page's own session (its stored token): headers, per request. */
  headers?: (page: Page) => Promise<Record<string, string>> | Record<string, string>;
}

const registry: { current?: PageApi } = ((globalThis as { [k: symbol]: { current?: PageApi } | undefined })[Symbol.for("waygraph.pageApi")] ??= {});

/** Sets the API the project's reads use (an Engine with `api` does this). */
export function setPageApi(api: PageApi | undefined): void {
  if (api) registry.current = api;
}

/** GET `path` (or what `path` makes of the page's address) on the project's API, as the page's session; the JSON, or undefined when it isn't ok. */
export async function getFromApi(page: Page, path: string | ((url: URL) => string)): Promise<unknown> {
  const api = registry.current;
  if (!api) throw new Error('ctx.page.api needs the API: new Engine({ api: { baseUrl: "…" } })');
  const target = typeof path === "function" ? path(new URL(page.url())) : path;
  const response = await page.request.get(api.baseUrl + target, { headers: (await api.headers?.(page)) ?? {} });
  return response.ok() ? ((await response.json().catch(() => undefined)) as unknown) : undefined;
}
