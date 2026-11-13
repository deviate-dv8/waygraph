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
    // What a Block would select this element by: its id, a test hook, its name, its label, else its role and text.
    const selectorOf = (el: Element): string => {
      const attr = (n: string) => el.getAttribute(n);
      if (el.id && !/\d{3,}/.test(el.id)) return "#" + el.id;
      for (const hook of ["data-test", "data-testid"]) if (attr(hook)) return `[${hook}="${attr(hook)}"]`;
      if (attr("name")) return `${el.tagName.toLowerCase()}[name="${attr("name")}"]`;
      if (attr("aria-label")) return `[aria-label="${attr("aria-label")}"]`;
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return text ? `${el.tagName.toLowerCase()}:has-text("${text.replace(/"/g, '\\"')}")` : el.tagName.toLowerCase();
    };
    let editing = false;
    const register = (el: Element, tag: HTMLElement) => {
      const bind = (window as unknown as { __wgRegister?: (arg: { selector: string; key: string }) => Promise<string> }).__wgRegister;
      if (!bind) return;
      const selector = selectorOf(el);
      editing = true;
      const input = __wgEl("input", { class: "field h-5 w-40 px-1 text-2xs", attrs: { placeholder: "name it, Enter registers", title: selector } }) as HTMLInputElement;
      __wgSet(tag, input);
      input.focus();
      input.addEventListener("keydown", async (ev) => {
        ev.stopPropagation();
        if (ev.key === "Escape") {
          editing = false;
          paint();
        } else if (ev.key === "Enter" && input.value.trim()) {
          const said = await bind({ selector, key: input.value.trim() });
          __wgSet(tag, said);
          setTimeout(() => {
            editing = false;
            paint();
          }, 1600);
        }
      });
    };
    const box = (el: Element, name: string, known: boolean, title?: string) => {
      const r = el.getBoundingClientRect();
      const tag = __wgEl(
        "span",
        { class: "pointer-events-auto absolute -top-4 left-0 max-w-[260px] truncate rounded-control px-1 text-2xs font-semibold text-on-accent " + (known ? "bg-green" : "bg-orange cursor-pointer"), attrs: { title: title ?? (known ? "" : "Click to register it: name the selector and it is written into this page's _sel.ts") } },
        name,
      );
      if (!known) tag.addEventListener("click", () => register(el, tag));
      return __wgEl(
        "div",
        { class: "wg-coverage-box absolute rounded-control border-2 " + (known ? "border-green border-solid" : "border-orange border-dashed"), style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` },
        tag,
      );
    };

    const paint = () => {
      if (editing) return;
      if (!on) {
        __wgSet(layer);
        label.textContent = "Coverage";
        return;
      }
      const boxes: Node[] = [];
      const claimed = new Set<Element>();
      let known = 0;
      for (const { selector, name, owner, where } of payload.entries) {
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
          boxes.push(box(el, (name || "registered") + (owner ? " · " + owner : ""), true, where ? name + (owner ? " on " + owner : "") + "\n" + where : undefined));
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
        boxes.push(box(el, "not registered · click to register", false));
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
    const set = (value: boolean) => {
      on = value;
      try {
        sessionStorage.setItem(KEY, on ? "1" : "0");
      } catch {
        /* blocked storage */
      }
      chip.classList.toggle("wg-coverage-on", on);
      paint();
      return on;
    };
    chip.addEventListener("click", () => set(!on));
    // The session protocol's `coverage` op (`waygraph pilot coverage <id> on|off`) switches it the same way.
    (window as unknown as { __wgCoverageSet?: (on: boolean) => boolean }).__wgCoverageSet = set;
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
