// The overlay trace (WAYGRAPH_OVERLAY_TRACE=1): every time a piece of the demo's overlay shows or goes, as a line in the
// demo log (`overlay +caption`, `overlay -outcome`), and how often each one went and came back at the end. A piece that
// goes and comes back between two steps on the same screen is a blink a viewer reads as "something new"; the trace is
// how a test (and a person tuning a demo) sees it.
import type { WgPage } from "../types.js";
import { ignorePageGone } from "../../engine/page-gone.js";

/** The pieces the trace follows, by the element that is each one, in the overlay's shadow root. */
const PIECES = {
  banner: "#wg-banner",
  caption: "#wg-caption-bar",
  outcome: "#wg-outcome",
  panel: "#wg-panel",
  ring: "#wg-ring",
  todos: ".wg-todo-dock",
} as const;
export type TracedPiece = keyof typeof PIECES;

/** One change: a piece showed (`on`) or went, `atMs` from the start of the trace. */
export interface OverlayChange {
  piece: TracedPiece;
  on: boolean;
  atMs: number;
}

/** In the page: polls which pieces are visible and reports each change. Self-contained (an init script). */
function watchOverlay(pieces: Record<string, string>): void {
  const w = window as unknown as { __wgTraceOn?: boolean; __wgOverlayChanged?: (piece: string, on: boolean) => void };
  if (w.__wgTraceOn) return;
  w.__wgTraceOn = true;
  const shown = new Map<string, boolean>();
  const visible = (el: Element | null): boolean => {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const tick = (): void => {
    const root = document.getElementById("wg-root")?.shadowRoot;
    for (const [piece, selector] of Object.entries(pieces)) {
      const on = visible(root?.querySelector(selector) ?? null);
      // A new document reports every piece on its first look: a piece the last page showed is gone until repainted.
      if (shown.get(piece) !== on) {
        shown.set(piece, on);
        w.__wgOverlayChanged?.(piece, on);
      }
    }
  };
  setInterval(tick, 40);
}

/** Starts the trace on the demo's page (every document it loads); returns what changed so far, when asked. */
export async function traceOverlay(page: WgPage, log: (line: string) => void): Promise<() => OverlayChange[]> {
  const changes: OverlayChange[] = [];
  const startedAt = Date.now();
  const now = new Map<TracedPiece, boolean>();
  await page.exposeFunction("__wgOverlayChanged", (piece: TracedPiece, on: boolean) => {
    if ((now.get(piece) ?? false) === on) return;
    now.set(piece, on);
    const change = { piece, on, atMs: Date.now() - startedAt };
    changes.push(change);
    log(`overlay ${on ? "+" : "-"}${piece} @${change.atMs}ms`);
  });
  await page.addInitScript(watchOverlay, PIECES);
  await page.evaluate(watchOverlay, PIECES).catch(ignorePageGone);
  return () => changes;
}

/** How often each piece went and came back (a blink); the summary the demo prints at the end. */
export function blinksOf(changes: readonly OverlayChange[]): Partial<Record<TracedPiece, number>> {
  const blinks: Partial<Record<TracedPiece, number>> = {};
  const seen = new Map<TracedPiece, boolean>();
  for (const { piece, on } of changes) {
    // Hidden, after it had been shown: when it comes back, that was a blink.
    if (on && seen.get(piece) === false) blinks[piece] = (blinks[piece] ?? 0) + 1;
    seen.set(piece, on);
  }
  return blinks;
}
