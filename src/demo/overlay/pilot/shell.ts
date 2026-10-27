import { ensureShadowRoot, installShadowRoot, shadowRootArgs } from "../ui/shadow.js";
import type { HighlightTone } from "../../../engine/stub/ring.js";
import { verboseLog } from "../../verbose-log.js";
import type { BrowserContext, Page } from "@playwright/test";
import { ignorePageGone } from "../../../engine/page-gone.js";

/** Browser-side shell install — runs on every document via context.addInitScript. */
function installPilotOverlayShell(): void {
  if (__wgById("wg-pilot-overlay")) return;
  const tab = (id: string, label: string, on: boolean) =>
    __wgEl(
      "button",
      {
        id,
        class: "wg-pilot-tab h-5 px-2.5 rounded-[5px] text-xs font-medium" + (on ? " wg-pilot-tab-active" : ""),
        attrs: { type: "button" },
      },
      label,
    );
  const root = __wgEl(
    "div",
    { id: "wg-pilot-overlay", class: "flex flex-col items-end gap-1.5 text-sm" },
    __wgEl(
      "div",
      { id: "wg-pilot-badge", class: "capsule material h-7 px-3 font-semibold cursor-default select-none" },
      __wgIcon("sparkle", "text-accent"),
      "Waygraph Pilot",
    ),
    __wgEl(
      "div",
      { id: "wg-pilot-panel", class: "material-thick rounded-panel w-[min(92vw,420px)] max-h-[320px] overflow-y-auto p-2.5 font-mono text-xs" },
      __wgEl(
        "div",
        { id: "wg-pilot-panel-toggle", class: "segmented mb-2 font-sans" },
        tab("wg-pilot-view-current", "Here", true),
        tab("wg-pilot-view-graph", "All nodes", false),
      ),
      __wgEl("div", { id: "wg-pilot-panel-current" }),
      __wgEl("div", { id: "wg-pilot-panel-graph", class: "overflow-auto", style: "display:none" }),
    ),
  );
  __wgAdd(root);
  __wgById("wg-pilot-badge")!.addEventListener("click", () => {
    __wgById("wg-pilot-panel")!.classList.toggle("wg-pilot-open");
  });
  __wgById("wg-pilot-view-current")!.addEventListener("click", () => {
    __wgById("wg-pilot-view-current")!.classList.add("wg-pilot-tab-active");
    __wgById("wg-pilot-view-graph")!.classList.remove("wg-pilot-tab-active");
    __wgById("wg-pilot-panel-current")!.style.display = "";
    __wgById("wg-pilot-panel-graph")!.style.display = "none";
  });
  __wgById("wg-pilot-view-graph")!.addEventListener("click", () => {
    __wgById("wg-pilot-view-graph")!.classList.add("wg-pilot-tab-active");
    __wgById("wg-pilot-view-current")!.classList.remove("wg-pilot-tab-active");
    __wgById("wg-pilot-panel-graph")!.style.display = "";
    __wgById("wg-pilot-panel-current")!.style.display = "none";
  });
  if (!__wgById("wg-pilot-activity")) {
    __wgAdd(__wgEl("div", { id: "wg-pilot-activity", class: "capsule material h-7 px-3 font-mono text-xs pointer-events-none" }));
  }
  if (!__wgById("wg-ring")) {
    __wgAdd(__wgEl("div", { id: "wg-ring", class: "wg-ring-el" }));
  }
  if (!__wgById("wg-ring-label")) {
    __wgAdd(__wgEl("div", { id: "wg-ring-label", class: "wg-ring-el-label" }));
  }
}


/**
 * Re-install the overlay shell on every navigation (about:blank, goto, etc.)
 * so the badge/panel persist outside the app's own DOM — not lost when the
 * page is blank or replaced.
 */
export async function installPersistentPilotOverlay(context: BrowserContext): Promise<void> {
  await context.addInitScript(installShadowRoot, shadowRootArgs());
  await context.addInitScript(installPilotOverlayShell);
}


/** Idempotent - safe to call before every update, matching narrate mode's own precedent. */
export async function ensureInstalled(page: Page): Promise<void> {
  await ensureShadowRoot(page);
  await page.evaluate(installPilotOverlayShell).catch(ignorePageGone);
  // The shared ring primitive (__wgEnsureRingEl/__wgPaintRingAt) - so Pilot's fixture rings paint
  // through the SAME implementation the demo/auto singleton ring uses (see ui/css/ring.css / this
  // file's own header comment on redundancy), not a separate DOM-building copy.
  const { installCore } = await import("../inpage/core.js");
  await page.evaluate(installCore, {}).catch(ignorePageGone);
}


/**
 * Bottom-left transient toast, separate from the persistent bottom-right
 * badge - real, direct user request: something that visibly flags "a
 * command is running" / "the map just changed" distinct from the
 * always-on Checkpoint badge. Self-clearing (CSS fade after a timeout),
 * not tied to the next `currentMenu()` snapshot the way the badge is,
 * since some callers (rawClick/rawType/rawGoto/reloadLibrary/applyPick)
 * only call `currentMenu()` again once the whole operation - including
 * this toast's own lifetime - should already be over.
 */
export async function showPilotActivity(page: Page, text: string): Promise<void> {
  await ensureInstalled(page);
  await page
    .evaluate((text) => {
      const toast = __wgById("wg-pilot-activity");
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add("wg-pilot-toast-show");
      const w = window as unknown as { __wgPilotToastTimer?: ReturnType<typeof setTimeout> };
      if (w.__wgPilotToastTimer) clearTimeout(w.__wgPilotToastTimer);
      w.__wgPilotToastTimer = setTimeout(() => {
        toast.classList.remove("wg-pilot-toast-show");
      }, 2500);
    }, text)
    .catch(ignorePageGone);
}


/**
 * "browser-use"-style vision box: a ring drawn around the exact element
 * `auto dom --selector <sel>` just inspected, so a human watching a headful
 * Pilot session can see what the agent is actually looking at, not just a
 * JSON blob in a terminal. Real, direct user request.
 *
 * Reuses the real `#wg-ring`/`#wg-ring-label` elements + `WAYGRAPH_RING_CSS`
 * (see `demo/narration/index.ts`) - the exact same visual language `cli.ts`'s own demo
 * stepper paints rings with, not a separate look-alike. Still a purpose-built
 * renderer here (position/show/hide only, via plain `getBoundingClientRect` -
 * no camera zoom/spotlight/todo-dock/pacing), since that whole engine still
 * lives in `cli.ts`, which this file continues to avoid importing (see this
 * file's own header). Auto-fades a few real seconds after showing (or
 * sooner if explicitly replaced/hidden first) - tuned live twice: an
 * original 2.5s fade read as gone before it could be seen, a since-tried
 * "stay up indefinitely" alternative read as lingering clutter instead.
 *
 * `tone` defaults to "auto" (gray) - real, direct user request: "gray is
 * waygraph playwright run. orange is dom check" - a real Block run or a
 * raw click/type/upload IS a real Playwright-driven action (`auto` was
 * always documented as meaning exactly that), while a pure `auto dom` read
 * touches nothing, so it gets its own "orange" tone instead.
 *
 * For agent-authored multi-ring / todo narration, use {@link showPilotFixtures}
 * (`auto highlight`) instead - this vision ring is one-shot inspect feedback.
 */
export async function showPilotVision(
  page: Page,
  selector: string,
  label: string,
  tone: HighlightTone = "auto",
): Promise<void> {
  await ensureInstalled(page);
  // Resolved through Playwright's own locator (>> piercing / :has-text() / :visible support), not
  // a raw querySelector string - see rings.js's showRing for the same fix, same reason. count()
  // gate: Locator.evaluate() has no timeout option and auto-waits ~30s for a match to appear -
  // count() never waits, keeping this an immediate "does it exist right now" check.
  const visionLoc = page.locator(selector).first();
  const box =
    (await visionLoc.count().catch(() => 0)) > 0
      ? await visionLoc
          .evaluate((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return null;
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          })
          .catch(() => null)
      : null;
  if (!box) {
    verboseLog("pilot", `vision ring not painted - selector matched nothing (or a zero-size element): ${selector}`);
  }
  await page
    .evaluate(
      ({ box, label, tone }) => {
        const ring = __wgById("wg-ring");
        const tag = __wgById("wg-ring-label");
        if (!ring || !tag) return;
        const w = window as unknown as { __wgVisionHideTimer?: ReturnType<typeof setTimeout> };
        if (w.__wgVisionHideTimer) clearTimeout(w.__wgVisionHideTimer);
        if (!box) {
          ring.style.opacity = "0";
          tag.style.opacity = "0";
          return;
        }
        const rect = box;
        ring.dataset.tone = tone;
        ring.dataset.size = "md";
        tag.dataset.tone = tone;
        tag.dataset.size = "md";
        tag.dataset.weight = "normal";
        ring.style.left = `${rect.left - 3}px`;
        ring.style.top = `${rect.top - 3}px`;
        ring.style.width = `${rect.width + 6}px`;
        ring.style.height = `${rect.height + 6}px`;
        tag.textContent = label;
        tag.style.left = `${Math.max(0, rect.left)}px`;
        tag.style.top = `${Math.max(0, rect.top - 24)}px`;
        ring.style.opacity = "1";
        tag.style.opacity = "1";
        // Real, direct user correction: this used to be a 30s "long
        // fallback" (stay up until explicitly replaced) - after actually
        // watching it, the user wants it to auto-clear after a few real
        // seconds instead, not linger. Short enough to still read as "just
        // happened", not so short it's gone before you look (that was the
        // ORIGINAL complaint this session, at 2.5s - this is deliberately
        // in between).
        w.__wgVisionHideTimer = setTimeout(() => {
          ring.style.opacity = "0";
          tag.style.opacity = "0";
        }, 4_000);
      },
      { box, label, tone },
    )
    .catch(ignorePageGone);
}
