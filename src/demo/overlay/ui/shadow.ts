/**
 * Shadow-DOM mount for every waygraph overlay element. Overlay UI lives in one open shadow root under
 * `<div id="wg-root">`, so the host page's CSS can't restyle it and ours can't leak out.
 *
 * `installShadowRoot` runs INSIDE the page (page.evaluate / addInitScript), so it must stay
 * self-contained. It defines the `__wg*` helpers the overlay code uses in place of `document.*`:
 * lookups check the shadow root first and fall back to the light DOM (the device stage shell and
 * host-page markers such as `[data-wg-zoomed]` intentionally stay in the light DOM).
 */
import type { Page } from "@playwright/test";
import { getOverlaySheet } from "./stylesheet.js";
import { ignorePageGone } from "../../../engine/page-gone.js";

/**
 * `overlaySheet` is the ONE real-CSS bundle (`ui/stylesheet.ts` -> `dist/ui/overlay.css`, built on
 * Open Props - see `src/demo/overlay/ui/css/README.md`) every surface shares; passed in from Node since in-page
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
  // Overlay elements are built with the DOM, never from HTML strings: text (page text, authored labels) is always a
  // text node, so nothing it contains is parsed as markup.
  type Child = string | number | Node | null | undefined | false | readonly Child[];
  const toNodes = (children: readonly Child[], out: Node[] = []): Node[] => {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) toNodes(c, out);
      else out.push(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return out;
  };
  w.__wgEl = (tag: string, props: WgElProps | null | undefined, ...children: Child[]) => {
    const el = document.createElement(tag);
    if (props?.id) el.id = props.id;
    if (props?.class) el.className = props.class;
    if (props?.style) el.style.cssText = props.style;
    if (props?.title) el.title = props.title;
    for (const [k, v] of Object.entries(props?.data ?? {})) if (v != null) el.dataset[k] = String(v);
    for (const [k, v] of Object.entries(props?.attrs ?? {})) if (v != null) el.setAttribute(k, String(v));
    el.append(...toNodes(children));
    return el;
  };
  w.__wgSet = (el: Element, ...children: Child[]) => el.replaceChildren(...toNodes(children));
  // Waygraph's own static icons (constants in this package, never page or author text), parsed as SVG.
  w.__wgSvg = (markup: string) => {
    const xml = markup.includes("xmlns=") ? markup : markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    return document.importNode(new DOMParser().parseFromString(xml, "image/svg+xml").documentElement, true);
  };
  if (overlaySheet) w.__wgCss(overlaySheet, "wg-overlay-css");
}

/** Idempotent; call before any overlay install on a page. Installs the shared stylesheet bundle. */
export async function ensureShadowRoot(page: Page): Promise<void> {
  await page.evaluate(installShadowRoot, getOverlaySheet()).catch(ignorePageGone);
}
