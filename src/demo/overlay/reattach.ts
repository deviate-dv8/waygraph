// How every overlay surface (demo, auto, pilot) survives navigation. A full page load - a link, a redirect, a reload, a
// login bouncing back - wipes the overlay from the page. A surface registers how to repaint itself once; it then runs
// after every load (a redirect chain repaints once, when it settles), and on demand through `repaintOverlay`.
import type { Page } from "@playwright/test";

type Repaint = () => Promise<unknown>;

const repaints = new WeakMap<Page, Repaint>();
const running = new WeakMap<Page, Promise<void>>();

/** Repaints the page's overlay now, after any repaint already running (two never interleave). */
export function repaintOverlay(page: Page): Promise<void> {
  const next = (running.get(page) ?? Promise.resolve()).then(async () => {
    await repaints.get(page)?.();
  }).catch(() => {});
  running.set(page, next);
  return next;
}

/** Registers (or replaces) how this page's overlay repaints itself after a navigation. */
export function keepOverlayOnNavigation(page: Page, repaint: Repaint): void {
  const listening = repaints.has(page);
  repaints.set(page, repaint);
  if (listening) return;
  let settle: ReturnType<typeof setTimeout> | undefined;
  page.on("load", () => {
    clearTimeout(settle);
    settle = setTimeout(() => void repaintOverlay(page), 80);
  });
}
