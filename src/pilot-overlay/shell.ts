// Split out of the former 950-line pilot-overlay.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { SURFACE } from "../ui/tokens.js";
import { pilotFxRingCss } from "../ui/components/ring.js";
import { WAYGRAPH_RING_CSS } from "../highlights.js";
import type { HighlightTone } from "../highlights.js";
import type { BrowserContext, Page } from "@playwright/test";

// Real, direct user request: this overlay's own colors were an improvised
// purple/white scheme (#a78bfa / #1a1033) that didn't match anything else -
// "our design here seems like barely shares with the ui on the stepper
// design... looks a bit different and out of sync". These are the SAME
// colors `cli.ts`'s own demo panel/ring already use (#7C3AED primary
// purple, the dark rgba(20,10,40,.94) panel background + white text,
// #c9a6ff for a secondary purple accent on that dark background - all
// copied verbatim from cli.ts's own `#wg-panel`/`RING_CSS`, not
// re-invented) - genuinely the same visual language, not just the ring CSS
// this file already shared via WAYGRAPH_RING_CSS.
const OVERLAY_CSS = `
#wg-pilot-overlay {
  position: fixed; z-index: 2147483000; bottom: 12px; right: 12px;
  font: 12px/1.4 ui-monospace, "SF Mono", Consolas, monospace;
  color: #fff; pointer-events: auto;
}
#wg-pilot-badge {
  background: #7C3AED; color: #fff; padding: 6px 10px; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25); cursor: pointer; white-space: nowrap;
  font-weight: 600; user-select: none;
}
#wg-pilot-panel {
  display: none; margin-top: 6px; max-width: 420px; max-height: 320px;
  overflow-y: auto; background: ${SURFACE}; color: #fff; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25); padding: 8px 10px;
}
/* The graph tab renders a real Mermaid flowchart, which needs more room than
   the flat-list "Here" tab and its own scroll - real, direct user request:
   "a 2d version. left to right stuff. maybe mermaid?" replacing the original
   flat indented-text tree. Widened+its own scrollbox rather than growing
   the shared panel unconditionally, so "Here" stays compact. */
#wg-pilot-panel:has(#wg-pilot-panel-graph:not([style*="display: none"])) {
  max-width: 640px; max-height: 460px;
}
#wg-pilot-panel-graph { overflow: auto; }
#wg-pilot-panel-graph svg { max-width: none; }
#wg-pilot-panel-graph .wg-pilot-graph-note { color: #999; font-style: italic; font-size: 11px; padding: 4px 2px 0; }
#wg-pilot-panel.wg-pilot-open { display: block; }
#wg-pilot-panel-toggle { display: flex; gap: 6px; margin-bottom: 8px; }
#wg-pilot-panel-toggle button {
  background: transparent; color: #bbb; border: 1px solid rgba(255,255,255,.2);
  border-radius: 6px; padding: 3px 8px; font: inherit; cursor: pointer;
}
#wg-pilot-panel-toggle button.wg-pilot-tab-active { background: #7C3AED; color: #fff; border-color: #7C3AED; }
#wg-pilot-panel .wg-pilot-section { font-weight: 700; margin: 6px 0 2px; color: #c9a6ff; }
#wg-pilot-panel .wg-pilot-edge { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,.12); }
#wg-pilot-panel .wg-pilot-kind { color: #c9a6ff; font-weight: 600; }
#wg-pilot-panel .wg-pilot-desc { color: #bbb; }
#wg-pilot-panel .wg-pilot-empty { color: #999; font-style: italic; }
#wg-pilot-panel-graph .wg-pilot-graph-node { margin: 6px 0; }
#wg-pilot-panel-graph .wg-pilot-graph-checkpoint { color: #c9a6ff; font-weight: 700; }
#wg-pilot-panel-graph .wg-pilot-graph-edge { padding: 2px 0 2px 14px; border-left: 2px solid rgba(255,255,255,.15); font-size: 11px; }
#wg-pilot-panel-graph .wg-pilot-graph-edge .wg-pilot-kind { color: #c9a6ff; }
#wg-pilot-activity {
  position: fixed; z-index: 2147483000; bottom: 12px; left: 12px;
  font: 12px/1.4 ui-monospace, "SF Mono", Consolas, monospace;
  background: ${SURFACE}; color: #fff; padding: 6px 10px; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25); white-space: nowrap; pointer-events: none;
  opacity: 0; transform: translateY(4px); transition: opacity 0.15s, transform 0.15s;
}
#wg-pilot-activity.wg-pilot-toast-show { opacity: 1; transform: translateY(0); }
/* Agent-sent fixture rings: generated from ui/tokens (tones shared with #wg-ring). */
${pilotFxRingCss()}
#wg-pilot-fx-todos{
  position:fixed;z-index:2147483645;top:72px;max-width:280px;max-height:calc(100vh - 100px);overflow:auto;
  font:12px/1.4 ui-sans-serif,system-ui,sans-serif;color:#fff;
  background:${SURFACE};border-radius:10px;padding:10px 12px;
  box-shadow:0 2px 10px rgba(0,0,0,.3);pointer-events:auto;
  transition:opacity .25s ease;
}
#wg-pilot-fx-todos.wg-todo-behind{z-index:2147483643;opacity:.42;pointer-events:none;}
#wg-pilot-fx-todos[data-pos=left]{left:14px;right:auto;}
#wg-pilot-fx-todos[data-pos=right]{right:14px;left:auto;}
#wg-pilot-fx-todos .wg-pilot-fx-todo-title{font-weight:700;color:#c9a6ff;margin-bottom:6px;}
#wg-pilot-fx-todos ol{margin:0;padding-left:18px;}
#wg-pilot-fx-todos li{margin:3px 0;color:#ddd;}
#wg-pilot-fx-todos li.wg-pilot-fx-todo-done{color:#888;text-decoration:line-through;}
#wg-pilot-fx-todos li.wg-pilot-fx-todo-now{color:#fff;font-weight:700;}
#wg-pilot-fx-todos[data-compact="1"]:not(:hover) li.wg-todo-fold{display:none;}
#wg-pilot-fx-todos .wg-todo-more{margin-top:6px;padding:4px 8px;border-radius:8px;
  background:rgba(124,58,237,.22);font:700 11px/1.2 system-ui,sans-serif;color:#e8dcff;}
/* Spotlight (demo focus:true) - dim page, cutout around target. */
#wg-pilot-fx-focus{position:fixed;z-index:2147483644;pointer-events:none;
  border-radius:12px;box-shadow:0 0 0 9999px rgba(8,4,20,.62);
  opacity:0;transition:opacity .3s ease,left .3s ease,top .3s ease,width .3s ease,height .3s ease;}
#wg-pilot-fx-focus.wg-in{opacity:1;}
/* Zoom HUD (demo parity - badge only; no CSS scale of the page). */
#wg-pilot-fx-zoom{position:fixed;z-index:2147483646;bottom:14px;right:14px;
  display:flex;align-items:center;gap:7px;padding:6px 11px 6px 8px;
  border-radius:999px;background:${SURFACE};color:#f0e8ff;
  border:1px solid rgba(250,204,21,.6);box-shadow:0 6px 18px rgba(0,0,0,.4);
  font:700 12px/1.2 system-ui,sans-serif;pointer-events:none;}
#wg-pilot-fx-zoom .wg-pilot-fx-zoom-ico{width:18px;height:18px;display:flex;align-items:center;justify-content:center;
  border-radius:6px;background:rgba(250,204,21,.22);}
#wg-pilot-fx-zoom .wg-pilot-fx-zoom-ico svg{width:14px;height:14px;display:block;}
#wg-pilot-fx-zoom .wg-pilot-fx-zoom-val{color:#fde68a;font-variant-numeric:tabular-nums;font-weight:800;min-width:3.2em;}
#wg-pilot-fx-zoom[data-zoomed="1"]{border-color:#fbbf24;}
#wg-pilot-fx-device{position:fixed;z-index:2147483646;top:14px;right:14px;
  padding:8px 12px;border-radius:10px;background:${SURFACE};color:#f0e8ff;
  border:1px solid rgba(124,58,237,.55);font:700 12px/1.2 system-ui,sans-serif;
  pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.35);}
#wg-pilot-fx-device[data-preset=mobile]{border-color:#3B82F6;}
#wg-pilot-fx-device[data-preset=tablet]{border-color:#22C55E;}
#wg-pilot-fx-device[data-preset=desktop]{border-color:#9CA3AF;}
` + WAYGRAPH_RING_CSS;


/** Browser-side shell install — runs on every document via context.addInitScript. */
function installPilotOverlayShell(css: string): void {
  if (document.getElementById("wg-pilot-overlay")) return;
  const style = document.createElement("style");
  style.id = "wg-pilot-overlay-css";
  style.textContent = css;
  document.documentElement.appendChild(style);
  const root = document.createElement("div");
  root.id = "wg-pilot-overlay";
  root.innerHTML =
    '<div id="wg-pilot-badge">Waygraph Pilot</div>' +
    '<div id="wg-pilot-panel">' +
    '<div id="wg-pilot-panel-toggle"><button id="wg-pilot-view-current" class="wg-pilot-tab-active">Here</button>' +
    '<button id="wg-pilot-view-graph">All nodes</button></div>' +
    '<div id="wg-pilot-panel-current"></div>' +
    '<div id="wg-pilot-panel-graph" style="display:none"></div>' +
    "</div>";
  document.documentElement.appendChild(root);
  document.getElementById("wg-pilot-badge")!.addEventListener("click", () => {
    document.getElementById("wg-pilot-panel")!.classList.toggle("wg-pilot-open");
  });
  document.getElementById("wg-pilot-view-current")!.addEventListener("click", () => {
    document.getElementById("wg-pilot-view-current")!.classList.add("wg-pilot-tab-active");
    document.getElementById("wg-pilot-view-graph")!.classList.remove("wg-pilot-tab-active");
    document.getElementById("wg-pilot-panel-current")!.style.display = "";
    document.getElementById("wg-pilot-panel-graph")!.style.display = "none";
  });
  document.getElementById("wg-pilot-view-graph")!.addEventListener("click", () => {
    document.getElementById("wg-pilot-view-graph")!.classList.add("wg-pilot-tab-active");
    document.getElementById("wg-pilot-view-current")!.classList.remove("wg-pilot-tab-active");
    document.getElementById("wg-pilot-panel-graph")!.style.display = "";
    document.getElementById("wg-pilot-panel-current")!.style.display = "none";
  });
  if (!document.getElementById("wg-pilot-activity")) {
    const toast = document.createElement("div");
    toast.id = "wg-pilot-activity";
    document.documentElement.appendChild(toast);
  }
  if (!document.getElementById("wg-ring")) {
    const ring = document.createElement("div");
    ring.id = "wg-ring";
    document.documentElement.appendChild(ring);
  }
  if (!document.getElementById("wg-ring-label")) {
    const ringLabel = document.createElement("div");
    ringLabel.id = "wg-ring-label";
    document.documentElement.appendChild(ringLabel);
  }
}


/**
 * Re-install the overlay shell on every navigation (about:blank, goto, etc.)
 * so the badge/panel persist outside the app's own DOM — not lost when the
 * page is blank or replaced.
 */
export async function installPersistentPilotOverlay(context: BrowserContext): Promise<void> {
  await context.addInitScript(installPilotOverlayShell, OVERLAY_CSS);
}


/** Idempotent - safe to call before every update, matching narrate mode's own precedent. */
export async function ensureInstalled(page: Page): Promise<void> {
  await page.evaluate(installPilotOverlayShell, OVERLAY_CSS).catch(() => {});
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
      const toast = document.getElementById("wg-pilot-activity");
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add("wg-pilot-toast-show");
      const w = window as unknown as { __wgPilotToastTimer?: ReturnType<typeof setTimeout> };
      if (w.__wgPilotToastTimer) clearTimeout(w.__wgPilotToastTimer);
      w.__wgPilotToastTimer = setTimeout(() => {
        toast.classList.remove("wg-pilot-toast-show");
      }, 2500);
    }, text)
    .catch(() => {});
}


/**
 * "browser-use"-style vision box: a ring drawn around the exact element
 * `auto dom --selector <sel>` just inspected, so a human watching a headful
 * Pilot session can see what the agent is actually looking at, not just a
 * JSON blob in a terminal. Real, direct user request.
 *
 * Reuses the real `#wg-ring`/`#wg-ring-label` elements + `WAYGRAPH_RING_CSS`
 * (see `highlights.ts`) - the exact same visual language `cli.ts`'s own demo
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
  await page
    .evaluate(
      ({ selector, label, tone }) => {
        const ring = document.getElementById("wg-ring");
        const tag = document.getElementById("wg-ring-label");
        if (!ring || !tag) return;
        const w = window as unknown as { __wgVisionHideTimer?: ReturnType<typeof setTimeout> };
        if (w.__wgVisionHideTimer) clearTimeout(w.__wgVisionHideTimer);
        const el = document.querySelector(selector);
        if (!el) {
          ring.style.opacity = "0";
          tag.style.opacity = "0";
          return;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          ring.style.opacity = "0";
          tag.style.opacity = "0";
          return;
        }
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
      { selector, label, tone },
    )
    .catch(() => {});
}
