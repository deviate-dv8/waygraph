// What a live session does with the page it is on: keep what it shows on the session's trail, switch the coverage view, and hand the
// page the elements of the selectors only Playwright reads.
import type { Frame, Page } from "@playwright/test";
import { ignorePageGone } from "../../engine/page-gone.js";
import type { MemPage } from "../../engine/mem/mem.js";
import { readBlocksFor, readCheckpoint } from "../../engine/read/read-block.js";
import { unmappedInteractionsPageScript } from "../../analysis/coverage-gap.js";
import { isEngineSelector } from "../../engine/trait/selector.js";
import type { CoverageResponse } from "./protocol.js";

/** Keeps what the page shows at `here` on the session's trail, as a run does after a step: a check or a stub can ask for it later. */
export async function keepLook(page: Page, mem: MemPage, here: string | null, block: string, step: number, addresses: readonly string[] = []): Promise<void> {
  if (here === null || readBlocksFor(here).length === 0) return;
  try {
    const { read } = await readCheckpoint(page, mem, here);
    const params = paramsFrom(page.url(), addresses);
    mem.trail.add({ step, block, page: here, read, ...(params ? { params } : {}) });
  } catch {
    /* a page that can't be read is not a failed step */
  }
}

/** The params of `url` against the first address pattern it fits (`/items/:id`), when any has params. */
export function paramsFrom(url: string, patterns: readonly string[]): Record<string, string> | undefined {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return undefined;
  }
  for (const pattern of patterns) {
    const names = [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1] ?? "");
    if (!names.length) continue;
    const found = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "([^/]+)")}$`).exec(path);
    if (found) return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(found[i + 1] ?? "")]));
  }
  return undefined;
}

/** Turns the coverage outlines on or off (the page's own Coverage chip does the same); only a visible session draws them. */
export async function setCoverageOn(page: Page, on: boolean, headless: boolean): Promise<CoverageResponse> {
  if (headless) return { ok: false, error: "coverage is drawn in a visible session (not --headless)" };
  const shown = await page.evaluate((v) => (window as unknown as { __wgCoverageSet?: (on: boolean) => boolean }).__wgCoverageSet?.(v), on).catch(ignorePageGone);
  return shown === undefined ? { ok: false, error: "the coverage view is not on this page yet" } : { ok: true, on: shown };
}

/**
 * The elements Playwright finds for the selectors only it reads (a `sel.role(...)`), put in the page's `__wgEngineEls`, where the
 * coverage chip and the unmapped-interaction scan look: the page can't run Playwright's engines, so Node does and hands the result over.
 * An invalid selector is skipped, never an error.
 */
export async function resolveEngineSelectors(frame: Frame, selectors: readonly string[]): Promise<void> {
  for (const selector of new Set(selectors.filter(isEngineSelector))) {
    await frame
      .locator(selector)
      .evaluateAll((els, key) => void (window.__wgEngineEls ??= new Map()).set(key, els), selector)
      .catch(ignorePageGone);
  }
}

/** Flags the page's same-origin links and visible buttons nothing maps (read from the console): after the Playwright-only selectors are resolved for it. */
export async function scanUnmapped(page: Page, knownPathnames: string[], knownSelectors: string[]): Promise<void> {
  await resolveEngineSelectors(page.mainFrame(), knownSelectors);
  await page.evaluate(unmappedInteractionsPageScript, { knownPathnames, knownSelectors }).catch(ignorePageGone);
}
