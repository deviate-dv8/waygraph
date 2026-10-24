// The auto picker's menu: the in-page panel (headfulPick) or the terminal menu (cliPick), and the "running" banner.
import type { Page } from "@playwright/test";
import { createInterface } from "node:readline/promises";
import { ensureShadowRoot } from "../../demo/overlay/ui/shadow.js";
import type { MemKey, MemPage } from "../../engine/mem/mem.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import type { BlockEntry } from "../../manifest/project.js";
import type { ExploreMenu } from "./explore.js";
import { memStubValue } from "./mem.js";


export async function setAutoPanelRunning(page: Page, label: string): Promise<void> {
  await page
    .evaluate(
      (label) => {
        const panel = __wgById("wg-auto-panel");
        if (!panel) return;
        __wgSet(panel, __wgEl("h3", null, "waygraph auto"), __wgEl("div", { style: "padding:12px 0;color:#c9a6ff" }, "Running: ", __wgEl("strong", null, label)));
        if (typeof window.__wgWirePanelChrome === "function") {
          window.__wgWirePanelChrome(panel, "wg-auto-panel-hidden", "waygraph auto");
        }
        if (typeof window.__wgStampModal === "function") {
          window.__wgStampModal(panel, "auto-panel", {
            phase: "running",
            block: label,
            ready: true,
          });
        } else {
          panel.setAttribute("data-wg-ui", "1");
          panel.setAttribute("data-wg-modal", "auto-panel");
          panel.setAttribute("data-wg-phase", "running");
          panel.setAttribute("data-wg-ready", "1");
        }
      },
      label
    )
    .catch(ignorePageGone);
}
export const PANEL_CSS = "#wg-auto-panel{position:fixed;z-index:2147483647;left:50%;bottom:12px;transform:translateX(-50%);" +
  "max-width:min(92vw,720px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;" +
  "background:rgba(20,10,40,.94);color:#fff;border-radius:14px;padding:16px 20px;" +
  "font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);}" +
  "#wg-auto-panel h3{margin:0 0 10px;font-size:16px;}" +
  "#wg-auto-panel .wg-here{color:#c9a6ff;margin-bottom:12px;}" +
  "#wg-auto-panel .wg-actions{display:flex;flex-direction:column;gap:8px;}" +
  "#wg-auto-panel button.wg-act{text-align:left;padding:10px 12px;border-radius:10px;border:1px solid #5b3aa8;" +
  "background:#2a1450;color:#fff;font:13px/1.3 system-ui,sans-serif;cursor:pointer;}" +
  "#wg-auto-panel button.wg-act:hover{background:#3a1d70;}" +
  "#wg-auto-panel button.wg-act .wg-kind{color:#a78bfa;font-size:11px;text-transform:uppercase;}" +
  "#wg-auto-panel button.wg-quit{margin-top:12px;background:#3a1a1a;border-color:#7f1d1d;}" +
  "#wg-auto-panel textarea{width:100%;box-sizing:border-box;margin:6px 0 10px;background:#1a1030;color:#fff;" +
  "border:1px solid #5b3aa8;border-radius:8px;padding:8px;font:12px/1.3 monospace;}" +
  "#wg-auto-panel label.wg-mem{display:block;margin-top:8px;font-size:12px;color:#ddd;}" +
  "#wg-auto-panel .wg-section{margin:12px 0 6px;font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.04em;}" +
  "#wg-auto-panel .wg-map{margin:8px 0 12px;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.25);font-size:11px;line-height:1.5;}" +
  "#wg-auto-panel .wg-map .wg-cp{opacity:.55;}#wg-auto-panel .wg-map .wg-cp-here{color:#fff;opacity:1;font-weight:700;}" +
  "#wg-auto-panel .wg-chrome{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;}" +
  "#wg-auto-panel .wg-chrome-title{font:700 11px/1.2 system-ui,sans-serif;color:#c9a6ff;" +
  "letter-spacing:.04em;text-transform:uppercase;}" +
  "#wg-auto-panel button.wg-hide-btn{margin:0;padding:4px 10px;font:600 11px system-ui,sans-serif;" +
  "background:#3a2a60;color:#e8dcff;border:1px solid #5b3aa8;border-radius:6px;cursor:pointer;}" +
  "#wg-auto-panel button.wg-hide-btn:hover{background:#4b2a80;}" +
  "#wg-auto-panel.wg-collapsed{width:auto;max-width:90vw;padding:8px 12px;max-height:none;overflow:hidden;}" +
  "#wg-auto-panel.wg-collapsed .wg-body{display:none;}" +
  "#wg-auto-panel.wg-collapsed .wg-chrome{margin:0;}" +
  "@media (max-width:640px){" +
  "#wg-auto-panel{left:8px;right:8px;bottom:8px;transform:none;max-width:none;width:auto;" +
  "max-height:min(55vh,calc(100vh - 16px));padding:12px 14px;border-radius:12px;}" +
  "#wg-auto-panel.wg-collapsed{left:50%;right:auto;transform:translateX(-50%);width:auto;}" +
  "#wg-auto-panel button.wg-act{padding:12px;font-size:14px;}" +
  "}";
export type PickResult = { type: "pick"; index: number; } | { type: "quit"; };
/**
 * Mem keys any Block on the current menu might read this turn - minus keys a
 * dynamic `instanceOptions` row already answers by picking it (e.g. "which
 * item to add to cart" comes from the menu row itself, not a hand-typed JSON
 * textarea).
 */
export function memKeysForMenu(menu: ExploreMenu, library: Map<string, BlockEntry>): readonly MemKey<unknown>[] {
  const instanceKeys = new Set<MemKey<unknown>>();
  for (const edge of menu.flat) {
    if (edge.instanceOption) instanceKeys.add(edge.instanceOption.key);
  }
  const keys = new Map<string, MemKey<unknown>>();
  for (const edge of menu.flat) {
    const entry = library.get(edge.block);
    for (const k of entry?.block.requires ?? []) {
      if (instanceKeys.has(k)) continue;
      keys.set(k.name, k);
    }
  }
  return [...keys.values()];
}
export async function syncPanelMem(page: Page, mem: MemPage, keys: readonly MemKey<unknown>[]): Promise<void> {
  if (keys.length === 0) return;
  await ensureShadowRoot(page);
  const edits = (await page.evaluate(() => {
    const out: Record<string, string> = {};
    __wgQA("textarea.wg-mem-input").forEach((ta) => {
      const key = ta.getAttribute("data-mem-key");
      if (key) out[key] = (ta as HTMLTextAreaElement).value;
    });
    return out;
  })) as Record<string, string>;
  for (const k of keys) {
    const raw = edits[k.name];
    if (raw === undefined) continue;
    try {
      mem.set(k, JSON.parse(raw));
    } catch (err) {
      throw new Error(
        `Invalid JSON for mem key "${k.name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
export function armPickWait(): { promise: Promise<PickResult>; resolve: (v: PickResult) => void; } {
  let resolve!: (v: PickResult) => void;
  const promise = new Promise<PickResult>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
export async function headfulPick(
  page: Page,
  menu: ExploreMenu,
  library: Map<string, BlockEntry>,
  mem: MemPage,
  waitPick: () => Promise<PickResult>,
  /** What the last Block run did, shown at the top of the menu. */
  note: string | null): Promise<PickResult> {
  const here = menu.here;
  const hereLabel = here ?? (menu.flat.length > 0 ? "Unknown - pick Start here" : "Unknown - no moves available");
  const menuMemKeys = memKeysForMenu(menu, library);
  const memFields: { name: string; value: string; }[] = menuMemKeys.map((k) => {
    let value = "{}";
    try {
      if (mem.has(k)) value = JSON.stringify(mem.get(k), null, 2);
      else {
        const def = memStubValue(k);
        if (def !== undefined) value = JSON.stringify(def, null, 2);
      }
    } catch {
      /* a value JSON can't encode shows as {} for the person to fill in */
    }
    return { name: k.name, value };
  });

  // Pre-resolve every candidate's hover-preview box THROUGH Playwright's own locator (>>
  // piercing / :has-text() / :visible support), once, here on the Node side - not a raw selector
  // string handed to the page for a per-mouseenter document.querySelector to fail silently on
  // (same class of bug as rings.js's showRing; see its own comment for the full story). A
  // mouseenter handler can't itself await a Node-side locator without visible hover lag, so the
  // box is embedded as a data attribute instead and the in-page handler just reads it.
  const hlSelectors = new Set<string>();
  for (const section of menu.sections) {
    for (const c of section.edges) {
      const entry = library.get(c.block);
      const navClick = (entry?.block as { __waygraphNavClick?: unknown; } | undefined)?.__waygraphNavClick;
      const hl = c.instanceOption?.highlight ?? (typeof navClick === "string" ? navClick : undefined);
      if (hl) hlSelectors.add(hl);
    }
  }
  const hlBoxes = new Map<string, { x: number; y: number; width: number; height: number; } | null>();
  await Promise.all(
    [...hlSelectors].map(async (sel) => {
      const loc = page.locator(sel).first();
      const box = (await loc.count().catch(() => 0)) > 0
        ? await loc
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 1 && r.height < 1) return null;
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })
          .catch(() => null)
        : null;
      hlBoxes.set(sel, box);
    })
  );

  type MenuButton = { idx: number; hlBox: string | undefined; label?: string; kind?: string; block?: string; to?: string; description?: string; };
  let idx = 0;
  const sections = menu.sections.map((section) => ({
    title: section.title,
    buttons: section.edges.map((c): MenuButton => {
      const entry = library.get(c.block);
      const navClick = (entry?.block as { __waygraphNavClick?: unknown; } | undefined)?.__waygraphNavClick;
      const hl = c.instanceOption?.highlight ?? (typeof navClick === "string" ? navClick : undefined);
      const hlBox = hl ? hlBoxes.get(hl) : null;
      const base = { idx: idx++, hlBox: hlBox ? JSON.stringify(hlBox) : undefined };
      if (c.label) return { ...base, label: c.label };
      return { ...base, kind: c.kind, block: c.block, to: c.to, ...(entry?.description ? { description: entry.description } : {}) };
    }),
  }));

  await ensureShadowRoot(page);
  await page.evaluate(
    ({ css, note, hereLabel, memFields, sections }) => {
      __wgCss(css, "wg-auto-style");
      __wgById("wg-auto-panel")?.remove();
      const root = __wgEl(
        "div",
        { id: "wg-auto-panel" },
        __wgEl("h3", null, "waygraph auto"),
        note ? __wgEl("div", { style: "margin-bottom:8px;font-size:12px;color:#a7f3d0" }, note) : null,
        __wgEl("div", { class: "wg-here" }, "You are here: ", __wgEl("strong", null, hereLabel)),
        memFields.length ? __wgEl("div", { class: "wg-section" }, "Mem - edit credentials, then click a block below") : null,
        memFields.map((f, i) => {
          const field = __wgEl("textarea", { class: "wg-mem-input", id: "wg-mem-" + i, data: { memKey: f.name }, attrs: { rows: 4 } });
          field.value = f.value;
          return [__wgEl("label", { class: "wg-mem" }, f.name), field];
        }),
        __wgEl(
          "div",
          { class: "wg-actions" },
          sections.length === 0 ? __wgEl("div", { style: "opacity:.85;padding:8px 0" }, "No moves from this screen right now.") : null,
          sections.map((section) => [
            __wgEl("div", { class: "wg-section" }, section.title),
            section.buttons.map((b) => __wgEl(
              "button",
              { class: "wg-act", data: { idx: b.idx, hlBox: b.hlBox } },
              b.label !== undefined
                ? b.label
                : [
                  __wgEl("span", { class: "wg-kind" }, b.kind ?? ""),
                  " ",
                  __wgEl("strong", null, b.block ?? ""),
                  " -> " + (b.to ?? ""),
                  b.description ? [__wgEl("br"), __wgEl("span", { style: "opacity:.85" }, b.description)] : null,
                ]
            )
            ),
          ])
        ),
        __wgEl("button", { class: "wg-act wg-quit", data: { quit: "1" } }, "Quit")
      );
      __wgAdd(root);
      // Chrome + Hide/Show, shared with setAutoPanelRunning.
      window.__wgWirePanelChrome = (el: HTMLElement, storageKey: string, chromeTitle?: string) => {
        if (!el) return;
        if (!el.querySelector(":scope > .wg-chrome")) {
          const body = __wgEl("div", { class: "wg-body" }, Array.from(el.childNodes));
          const chrome = __wgEl(
            "div",
            { class: "wg-chrome" },
            __wgEl("span", { class: "wg-chrome-title" }, chromeTitle || "waygraph auto"),
            __wgEl("button", { class: "wg-hide-btn", data: { wgToggle: "1" }, attrs: { type: "button" } }, "Hide")
          );
          el.append(chrome, body);
        }
        const apply = (hidden: boolean) => {
          el.classList.toggle("wg-collapsed", hidden);
          el.setAttribute("data-wg-collapsed", hidden ? "1" : "0");
          const t = el.querySelector("[data-wg-toggle]");
          if (t) t.textContent = hidden ? "Show" : "Hide";
          try {
            localStorage.setItem(storageKey, hidden ? "1" : "0");
          } catch {
            /* blocked storage: Hide still works for this page */
          }
        };
        let hidden = false;
        try {
          hidden = localStorage.getItem(storageKey) === "1";
        } catch {
          /* blocked storage: starts shown */
        }
        apply(hidden);
        const toggle = el.querySelector<HTMLElement>("[data-wg-toggle]");
        if (toggle && !toggle.dataset.wgWired) {
          toggle.dataset.wgWired = "1";
          toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            apply(!el.classList.contains("wg-collapsed"));
          });
        }
      };
      window.__wgWirePanelChrome(root, "wg-auto-panel-hidden", "waygraph auto");
      if (typeof window.__wgStampModal === "function") {
        window.__wgStampModal(root, "auto-panel", { phase: "pick", ready: true });
      } else {
        root.setAttribute("data-wg-ui", "1");
        root.setAttribute("data-wg-modal", "auto-panel");
        root.setAttribute("data-wg-phase", "pick");
        root.setAttribute("data-wg-collapsed", root.classList.contains("wg-collapsed") ? "1" : "0");
        root.setAttribute("data-wg-ready", "1");
        window.__wgOverlayBeacon =
          window.__wgOverlayBeacon ||
          (() => Array.from(__wgQA('[data-wg-ui="1"]')).map((el) => {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return {
              id: el.id || null,
              modal: el.getAttribute("data-wg-modal"),
              ready: el.getAttribute("data-wg-ready") === "1",
              phase: el.getAttribute("data-wg-phase"),
              step: el.getAttribute("data-wg-step"),
              block: el.getAttribute("data-wg-block"),
              collapsed: el.getAttribute("data-wg-collapsed") === "1" || el.classList.contains("wg-collapsed"),
              opacity: st.opacity,
              textLen: (el.innerText || "").trim().length,
              w: Math.round(r.width),
              h: Math.round(r.height),
              visible: r.width > 0 && r.height > 0 && Number(st.opacity) > 0.05,
            };
          }));
      }
      root.querySelectorAll<HTMLElement>("button[data-idx]").forEach((btn) => {
        btn.addEventListener("click", () => window.__wgAutoPick?.(Number(btn.dataset.idx)));
        btn.addEventListener("mouseenter", () => {
          // Pre-resolved on the Node side via Playwright's own locator (>> piercing / :has-text()
          // support) when this menu was built - see headfulPick's own comment for why a
          // mouseenter handler can't itself round-trip to a Node-side locator per hover.
          const raw = btn.dataset.hlBox;
          if (!raw || typeof window.__wgPositionRing !== "function") return;
          window.__wgPositionRing(JSON.parse(raw), btn.textContent?.trim()?.slice(0, 80) || "target", "auto");
        });
        btn.addEventListener("mouseleave", () => window.__wgHideRing?.());
      });
      root.querySelector("[data-quit]")?.addEventListener("click", () => window.__wgAutoQuit?.());
    },
    { css: PANEL_CSS, note, hereLabel, memFields, sections }
  );

  return waitPick();
}
export function printCliMenu(menu: ExploreMenu, library: Map<string, BlockEntry>): void {
  console.log("");
  console.log(`You are here: ${menu.here ?? "Unknown (pick Start here)"}`);
  console.log("");
  if (menu.flat.length === 0) {
    console.log("  (no moves available on this page)");
  }
  let n = 0;
  for (const section of menu.sections) {
    console.log(`  -- ${section.title} --`);
    for (const c of section.edges) {
      const entry = library.get(c.block);
      n++;
      if (c.label) {
        console.log(`  [${n}] ${c.label}`);
      } else {
        const desc = entry?.description ? ` - ${entry.description}` : "";
        console.log(`  [${n}] ${c.block} (${c.kind}) -> ${c.to}${desc}`);
      }
    }
  }
  console.log("  [q] quit");
  console.log("");
}
export async function cliPick(
  menu: ExploreMenu,
  rl: ReturnType<typeof createInterface>): Promise<PickResult> {
  while (true) {
    let ans: string;
    try {
      ans = (await rl.question("Choose: ")).trim().toLowerCase();
    } catch {
      return { type: "quit" }; // stdin ended (piped / Ctrl-D) - same as q
    }
    if (ans === "q" || ans === "quit") return { type: "quit" };
    const n = Number(ans);
    if (Number.isInteger(n) && n >= 1 && n <= menu.flat.length) {
      return { type: "pick", index: n - 1 };
    }
    console.log("Enter a number from the list, or q to quit.");
  }
}
