/**
 * Shadow-DOM mount for every waygraph overlay element. Overlay UI lives in one open shadow root under
 * `<div id="wg-root">`, so the host page's CSS can't restyle it and ours can't leak out.
 *
 * `installShadowRoot` runs INSIDE the page (page.evaluate / addInitScript), so it must stay
 * self-contained. It defines the `__wg*` helpers the overlay code uses in place of `document.*`:
 * lookups check the shadow root first and fall back to the light DOM (the device stage shell and
 * host-page markers such as `[data-wg-zoomed]` intentionally stay in the light DOM).
 */
import type { BrowserContext, Page } from "@playwright/test";
import { getOverlaySheet } from "./stylesheet.js";

/**
 * `overlaySheet` is the ONE real-CSS bundle (`ui/stylesheet.ts` -> `dist/ui/overlay.css`, built on
 * Open Props - see `src/ui/css/README.md`) every surface shares; passed in from Node since in-page
 * code can't read a file. Installed once per shadow root, before anything else runs.
 */
export function installShadowRoot(overlaySheet?: string): void {
  const w = window as unknown as Record<string, unknown> & { __wgCss?: (css: string, key: string) => void };
  if (w.__wgById) return;
  const root = (): ShadowRoot => {
    let host = document.getElementById("wg-root");
    if (!host || !host.shadowRoot) {
      host?.remove();
      host = document.createElement("div");
      host.id = "wg-root";
      // No box of its own: children are position:fixed, so the host must never affect page layout.
      host.style.cssText = "display:contents";
      host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }
    return host.shadowRoot as ShadowRoot;
  };
  w.__wgRoot = root;
  w.__wgById = (id: string) => root().getElementById(id) || document.getElementById(id);
  w.__wgQ = (sel: string) => root().querySelector(sel) || document.querySelector(sel);
  w.__wgQA = (sel: string) => Array.from(root().querySelectorAll(sel)).concat(Array.from(document.querySelectorAll(sel)));
  w.__wgAdd = (node: Node) => root().appendChild(node);
  w.__wgCss = (css: string, key: string) => {
    const r = root();
    let style = Array.from(r.children).find((c) => c.tagName === "STYLE" && c.getAttribute("data-key") === key);
    if (!style) {
      style = document.createElement("style");
      style.setAttribute("data-key", key);
      r.insertBefore(style, r.firstChild);
    }
    if (style.textContent !== css) style.textContent = css;
  };
  if (overlaySheet) w.__wgCss(overlaySheet, "wg-overlay-css");
}

/** Idempotent; call before any overlay install on a page. Installs the shared stylesheet bundle. */
export async function ensureShadowRoot(page: Page): Promise<void> {
  await page.evaluate(installShadowRoot, getOverlaySheet()).catch(() => {});
}

/** Also define the helpers on every future document (pilot overlay persists across navigations). */
export async function installShadowRootEverywhere(context: BrowserContext): Promise<void> {
  await context.addInitScript(installShadowRoot, getOverlaySheet());
}
