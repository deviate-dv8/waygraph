// Page-side (an init script on every document - self-contained, no module-scope closure). The pilot's coverage view: a chip
// that, when on, outlines what waygraph knows on the page you're looking at. Green: registered (a selector some Block
// or page uses, labelled with its name; a link to a page waygraph has). Orange, dashed: something you can click or type
// in that nothing registers yet. A person who never reads the code sees what a flow can touch and what is still missing.
import type { CoveragePayload } from "../../../engine/coverage.js";

export function installCoverage(payload: CoveragePayload) {
  const KEY = "wg-coverage";
  const start = () => {
    if (typeof __wgById !== "function" || typeof __wgEl !== "function" || window.top !== window) return;
    if (__wgById("wg-coverage-chip")) return;
    let on = false;
    try {
      on = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* a page with no storage */
    }
    const label = __wgEl("span", {}, "Coverage");
    const chip = __wgEl("button", { id: "wg-coverage-chip", class: "capsule material h-7 px-3 text-xs font-semibold cursor-pointer", attrs: { type: "button", title: "Outline what waygraph knows on this page" } }, __wgIcon("checklist", "text-label-2"), label);
    __wgAdd(chip);
    const layer = __wgEl("div", { id: "wg-coverage", class: "absolute inset-0 pointer-events-none", attrs: { "data-wg-ui": "1" } });
    __wgAdd(layer);

    const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';
    const pathMatches = (path: string) =>
      payload.paths.some((known) => known === path || (known.includes("/:") && new RegExp("^" + known.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "[^/]+") + "$").test(path)));
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const s = getComputedStyle(el);
      return s.visibility !== "hidden" && s.display !== "none";
    };
    const box = (el: Element, name: string, known: boolean) => {
      const r = el.getBoundingClientRect();
      const tag = __wgEl(
        "span",
        { class: "absolute -top-4 left-0 max-w-[220px] truncate rounded-control px-1 text-2xs font-semibold text-on-accent " + (known ? "bg-green" : "bg-orange") },
        name,
      );
      return __wgEl(
        "div",
        { class: "wg-coverage-box absolute rounded-control border-2 " + (known ? "border-green border-solid" : "border-orange border-dashed"), style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` },
        tag,
      );
    };

    const paint = () => {
      if (!on) {
        __wgSet(layer);
        label.textContent = "Coverage";
        return;
      }
      const boxes: Node[] = [];
      const claimed = new Set<Element>();
      let known = 0;
      for (const { selector, name } of payload.entries) {
        let found: Element[] = [];
        try {
          found = Array.from(document.querySelectorAll(selector)).filter(visible);
        } catch {
          continue;
        }
        for (const el of found) {
          if (claimed.has(el)) continue;
          claimed.add(el);
          known += 1;
          boxes.push(box(el, name || "registered", true));
        }
      }
      let missing = 0;
      for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) {
        if (claimed.has(el) || !visible(el) || Array.from(claimed).some((c) => c.contains(el))) continue;
        if (el instanceof HTMLAnchorElement) {
          try {
            const u = new URL(el.href, location.href);
            if (u.origin === location.origin && pathMatches(u.pathname)) {
              known += 1;
              boxes.push(box(el, "page " + u.pathname, true));
              continue;
            }
            if (u.origin !== location.origin) continue;
          } catch {
            continue;
          }
        }
        missing += 1;
        boxes.push(box(el, "not registered", false));
      }
      __wgSet(layer, ...boxes);
      label.textContent = "Coverage " + known + " registered, " + missing + " not";
    };

    let queued = 0;
    const later = () => {
      if (!on || queued) return;
      queued = window.setTimeout(() => {
        queued = 0;
        paint();
      }, 120);
    };
    chip.addEventListener("click", () => {
      on = !on;
      try {
        sessionStorage.setItem(KEY, on ? "1" : "0");
      } catch {
        /* blocked storage */
      }
      chip.classList.toggle("wg-coverage-on", on);
      paint();
    });
    chip.classList.toggle("wg-coverage-on", on);
    window.addEventListener("scroll", later, true);
    window.addEventListener("resize", later);
    new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    paint();
  };
  // After the shadow root's own install (registered first), once the document has a body.
  const wait = () => (document.body ? start() : document.addEventListener("DOMContentLoaded", start, { once: true }));
  wait();
}
