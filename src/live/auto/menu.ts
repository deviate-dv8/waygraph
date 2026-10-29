// The auto picker's menu: the in-page panel (headfulPick) or the terminal menu (cliPick), and the "running" banner.
import { messageOf } from "../../engine/errors.js";
import type { Page } from "@playwright/test";
import { createInterface } from "node:readline/promises";
import { ensureShadowRoot } from "../../demo/overlay/ui/shadow.js";
import { installStamp } from "../../demo/overlay/inpage/stamp.js";
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
        __wgSet(
          panel,
          __wgEl(
            "div",
            { class: "flex items-center gap-2 py-2 text-base text-label-2" },
            __wgEl("span", { class: "wg-spinner" }),
            "Running",
            __wgEl("strong", { class: "font-semibold text-label" }, label),
          ),
        );
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
        `Invalid JSON for mem key "${k.name}": ${messageOf(err)}`
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
  // The beacon stamps (data-wg-ui / data-wg-ready, window.__wgOverlayBeacon) the panel is read by.
  await page.evaluate(installStamp).catch(ignorePageGone);
  await page.evaluate(
    ({ note, hereLabel, memFields, sections }) => {
      __wgById("wg-auto-panel")?.remove();
      const section = (title: string) => __wgEl("div", { class: "wg-section px-2 pt-3 pb-1 text-xs font-semibold text-label-2" }, title);
      const root = __wgEl(
        "div",
        { id: "wg-auto-panel", class: "material-thick rounded-panel w-[min(92vw,640px)] overflow-y-auto px-3 pt-2 pb-3 text-base" },
        note ? __wgEl("div", { class: "flex items-center gap-1.5 px-2 pb-1 text-sm text-green" }, __wgIcon("info"), note) : null,
        __wgEl(
          "div",
          { class: "wg-here flex items-center gap-1.5 px-2 pb-1 text-sm text-label-2" },
          "You are on",
          __wgEl("strong", { class: "font-semibold text-label" }, hereLabel),
        ),
        memFields.length ? section("Mem: edit the values, then pick a move") : null,
        memFields.map((f, i) => {
          const field = __wgEl("textarea", {
            class: "wg-mem-input field font-mono text-sm mb-2",
            id: "wg-mem-" + i,
            data: { memKey: f.name },
            attrs: { rows: 4 },
          });
          field.value = f.value;
          return [__wgEl("label", { class: "wg-mem block px-2 pb-1 font-mono text-xs font-medium text-label-2" }, f.name), field];
        }),
        __wgEl(
          "div",
          { class: "wg-actions flex flex-col" },
          sections.length === 0 ? __wgEl("div", { class: "px-2 py-2 text-sm text-label-3" }, "No moves from this screen.") : null,
          sections.map((s) => [
            section(s.title),
            s.buttons.map((b) =>
              __wgEl(
                "button",
                {
                  class: "wg-act flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-control text-left hover:bg-accent hover:text-on-accent group",
                  data: { idx: b.idx, hlBox: b.hlBox },
                  attrs: { type: "button" },
                },
                b.label !== undefined
                  ? b.label
                  : [
                      __wgEl(
                        "span",
                        { class: "flex items-center gap-1.5" },
                        __wgEl("span", { class: "wg-kind text-2xs font-semibold text-label-3 group-hover:text-on-accent/70" }, b.kind ?? ""),
                        __wgEl("strong", { class: "font-semibold" }, b.block ?? ""),
                        __wgIcon("chevronRight", "text-label-3 group-hover:text-on-accent/70"),
                        b.to ?? "",
                      ),
                      b.description ? __wgEl("span", { class: "text-sm text-label-2 group-hover:text-on-accent/80" }, b.description) : null,
                    ],
              ),
            ),
          ]),
        ),
        __wgEl(
          "div",
          { class: "flex justify-end mt-3 pt-3 border-t-[0.5px] border-separator" },
          __wgEl("button", { class: "wg-quit button button-destructive h-7 px-3.5", data: { quit: "1" }, attrs: { type: "button" } }, "Quit"),
        ),
      );
      __wgAdd(root);
      // Chrome + Hide/Show, shared with setAutoPanelRunning.
      window.__wgWirePanelChrome = (el: HTMLElement, storageKey: string, chromeTitle?: string) => {
        if (!el) return;
        if (!el.querySelector(":scope > .wg-chrome")) {
          const body = __wgEl("div", { class: "wg-body" }, Array.from(el.childNodes));
          const chrome = __wgEl(
            "div",
            { class: "wg-chrome flex items-center justify-between gap-2 h-7" },
            __wgEl("span", { class: "wg-chrome-title flex-1 min-w-0 truncate text-xs font-semibold text-label-2" }, chromeTitle || "waygraph auto"),
            __wgEl("button", { class: "wg-hide-btn button-plain text-xs", data: { wgToggle: "1" }, attrs: { type: "button" } }, "Hide"),
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
      window.__wgStampModal!(root, "auto-panel", { phase: "pick", ready: true });
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
    { note, hereLabel, memFields, sections }
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
