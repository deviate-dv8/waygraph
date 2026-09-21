/**
 * A small, self-contained on-page indicator for a live AutoSession -
 * "this browser is being driven by Waygraph," plus an expandable panel
 * showing the session's own current live menu. Real, direct user request:
 * a headful Pilot session looks like an ordinary browser tab with no
 * indication anything is driving it, which matters once a human might be
 * co-driving the same visible session (see `AutoSession.resync()`'s own
 * doc comment for the related state-desync problem that scenario causes).
 *
 * Deliberately NOT built on `src/cli.ts`'s own demo-panel/banner overlay
 * system, for the same reason `pilot-v1`'s narrate-mode ring renderer
 * wasn't either (see the git history at tag
 * `waygraph-pilot-v1-logs-prettified`): `cli.ts` runs `main().catch(...)`
 * unconditionally at module load with no `import.meta.url` guard, so
 * importing anything from it here would trigger the whole CLI's argument
 * dispatch as a side effect of loading a library module - unsafe. This
 * ships its own small, purpose-built badge + panel instead.
 */
import type { Page } from "@playwright/test";
import type { SessionSnapshot } from "./auto-session.js";
import {
  WAYGRAPH_RING_CSS,
  type HighlightTone,
  type DevicePreset,
  type DeviceState,
  normalizeHighlightTone,
  normalizeHighlightSize,
  normalizeHighlightWeight,
  formatHighlightCaption,
  resolveDeviceState,
} from "./highlights.js";

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
  overflow-y: auto; background: rgba(20,10,40,.94); color: #fff; border-radius: 8px;
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
  background: rgba(20,10,40,.94); color: #fff; padding: 6px 10px; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25); white-space: nowrap; pointer-events: none;
  opacity: 0; transform: translateY(4px); transition: opacity 0.15s, transform 0.15s;
}
#wg-pilot-activity.wg-pilot-toast-show { opacity: 1; transform: translateY(0); }
/* Agent-sent fixture rings share tone/size CSS with #wg-ring (demo language). */
.wg-pilot-fx-ring{position:fixed;z-index:2147483645;pointer-events:none;opacity:0;
  border:3px solid #7C3AED;border-radius:10px;box-sizing:border-box;
  transition:opacity .12s ease,left .12s,top .12s,width .12s,height .12s;}
.wg-pilot-fx-ring[data-tone=planned]{border-color:#7C3AED;box-shadow:0 0 0 4px rgba(124,58,237,.16);}
.wg-pilot-fx-ring[data-tone=auto]{border-color:#9CA3AF;box-shadow:0 0 0 4px rgba(156,163,175,.28);}
.wg-pilot-fx-ring[data-tone=info]{border-color:#3B82F6;box-shadow:0 0 0 4px rgba(59,130,246,.22);}
.wg-pilot-fx-ring[data-tone=warning]{border-color:#EAB308;box-shadow:0 0 0 4px rgba(234,179,8,.22);}
.wg-pilot-fx-ring[data-tone=danger]{border-color:#EF4444;box-shadow:0 0 0 4px rgba(239,68,68,.22);}
.wg-pilot-fx-ring[data-tone=success]{border-color:#22C55E;box-shadow:0 0 0 4px rgba(34,197,94,.22);}
.wg-pilot-fx-ring[data-tone=orange]{border-color:#F97316;box-shadow:0 0 0 4px rgba(249,115,22,.22);}
.wg-pilot-fx-label{position:fixed;z-index:2147483645;pointer-events:none;opacity:0;
  font:600 12px/1.3 ui-sans-serif,system-ui,sans-serif;padding:5px 9px;border-radius:6px;
  max-width:min(360px,80vw);box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;transition:opacity .12s ease;}
.wg-pilot-fx-label[data-tone=planned]{background:#7C3AED;color:#fff;}
.wg-pilot-fx-label[data-tone=auto]{background:#6B7280;color:#fff;}
.wg-pilot-fx-label[data-tone=info]{background:#2563EB;color:#fff;}
.wg-pilot-fx-label[data-tone=warning]{background:#EAB308;color:#1c1917;}
.wg-pilot-fx-label[data-tone=danger]{background:#DC2626;color:#fff;}
.wg-pilot-fx-label[data-tone=success]{background:#16A34A;color:#fff;}
.wg-pilot-fx-label[data-tone=orange]{background:#EA580C;color:#fff;}
.wg-pilot-fx-ring[data-size=sm]{border-width:1.5px;border-radius:8px;}
.wg-pilot-fx-ring[data-size=lg]{border-width:4px;border-radius:12px;}
.wg-pilot-fx-label[data-size=sm]{font-size:10px;padding:4px 7px;}
.wg-pilot-fx-label[data-size=lg]{font-size:16px;padding:8px 14px;}
.wg-pilot-fx-label[data-weight=bold]{font-weight:800;}
#wg-pilot-fx-todos{
  position:fixed;z-index:2147483645;top:72px;max-width:280px;
  font:12px/1.4 ui-sans-serif,system-ui,sans-serif;color:#fff;
  background:rgba(20,10,40,.94);border-radius:10px;padding:10px 12px;
  box-shadow:0 2px 10px rgba(0,0,0,.3);pointer-events:none;
}
#wg-pilot-fx-todos[data-pos=left]{left:14px;right:auto;}
#wg-pilot-fx-todos[data-pos=right]{right:14px;left:auto;}
#wg-pilot-fx-todos .wg-pilot-fx-todo-title{font-weight:700;color:#c9a6ff;margin-bottom:6px;}
#wg-pilot-fx-todos ol{margin:0;padding-left:18px;}
#wg-pilot-fx-todos li{margin:3px 0;color:#ddd;}
#wg-pilot-fx-todos li.wg-pilot-fx-todo-done{color:#888;text-decoration:line-through;}
#wg-pilot-fx-todos li.wg-pilot-fx-todo-now{color:#fff;font-weight:700;}
/* Spotlight (demo focus:true) - dim page, cutout around target. */
#wg-pilot-fx-focus{position:fixed;z-index:2147483644;pointer-events:none;
  border-radius:12px;box-shadow:0 0 0 9999px rgba(8,4,20,.62);
  opacity:0;transition:opacity .3s ease,left .3s ease,top .3s ease,width .3s ease,height .3s ease;}
#wg-pilot-fx-focus.wg-in{opacity:1;}
/* Zoom HUD (demo parity - badge only; no CSS scale of the page). */
#wg-pilot-fx-zoom{position:fixed;z-index:2147483646;bottom:14px;right:14px;
  display:flex;align-items:center;gap:7px;padding:6px 11px 6px 8px;
  border-radius:999px;background:rgba(20,10,40,.94);color:#f0e8ff;
  border:1px solid rgba(250,204,21,.6);box-shadow:0 6px 18px rgba(0,0,0,.4);
  font:700 12px/1.2 system-ui,sans-serif;pointer-events:none;}
#wg-pilot-fx-zoom .wg-pilot-fx-zoom-ico{width:18px;height:18px;display:flex;align-items:center;justify-content:center;
  border-radius:6px;background:rgba(250,204,21,.22);}
#wg-pilot-fx-zoom .wg-pilot-fx-zoom-ico svg{width:14px;height:14px;display:block;}
#wg-pilot-fx-zoom .wg-pilot-fx-zoom-val{color:#fde68a;font-variant-numeric:tabular-nums;font-weight:800;min-width:3.2em;}
#wg-pilot-fx-zoom[data-zoomed="1"]{border-color:#fbbf24;}
#wg-pilot-fx-device{position:fixed;z-index:2147483646;top:14px;right:14px;
  padding:8px 12px;border-radius:10px;background:rgba(20,10,40,.94);color:#f0e8ff;
  border:1px solid rgba(124,58,237,.55);font:700 12px/1.2 system-ui,sans-serif;
  pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.35);}
#wg-pilot-fx-device[data-preset=mobile]{border-color:#3B82F6;}
#wg-pilot-fx-device[data-preset=tablet]{border-color:#22C55E;}
#wg-pilot-fx-device[data-preset=desktop]{border-color:#9CA3AF;}
` + WAYGRAPH_RING_CSS;

/** Idempotent - safe to call before every update, matching narrate mode's own precedent. */
async function ensureInstalled(page: Page): Promise<void> {
  await page.addStyleTag({ content: OVERLAY_CSS }).catch(() => {});
  await page.evaluate(() => {
    if (document.getElementById("wg-pilot-overlay")) return;
    const root = document.createElement("div");
    root.id = "wg-pilot-overlay";
    // Real, direct user request: a way to see the WHOLE project's graph
    // (every Checkpoint/Block, not just what's reachable from the current
    // page) directly in the overlay, "like a node tree" - toggled inside
    // the same panel rather than a second popup, so there's one place to
    // look, not two.
    root.innerHTML =
      '<div id="wg-pilot-badge"></div>' +
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
    const toast = document.createElement("div");
    toast.id = "wg-pilot-activity";
    document.documentElement.appendChild(toast);
    const ring = document.createElement("div");
    ring.id = "wg-ring";
    const ringLabel = document.createElement("div");
    ringLabel.id = "wg-ring-label";
    document.documentElement.appendChild(ring);
    document.documentElement.appendChild(ringLabel);
  }).catch(() => {});
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

/** One ring the Pilot agent wants painted (same fields as demo stub rings). */
export type PilotFixtureRing = {
  selector: string;
  label: string;
  /** Extra caption line (demo `detail`). */
  detail?: string;
  /** Short badge, e.g. AC / BUG / GATE. */
  tag?: string;
  /** Any {@link HighlightTone} or alias (`error`/`blue`/…). Normalized on paint. */
  tone?: HighlightTone | string;
  size?: "sm" | "md" | "lg" | string;
  weight?: "normal" | "bold" | string;
  /** Caption text color (CSS). Overrides tone label color when set. */
  color?: string;
  /**
   * Camera zoom while this ring is up (demo parity: scroll + zoom badge;
   * does not CSS-scale the page). Typical `1.25`..`2`.
   */
  zoom?: number;
  /** When false, keep zoom after this paint / holdMs. Default true. */
  zoomOut?: boolean;
  /** Spotlight: dim the rest of the page around this target. */
  focus?: boolean;
};

/**
 * Agent-sent highlight fixtures for a live Pilot / auto session.
 * Painted by {@link showPilotFixtures}; driven via IPC `op: "highlight"`.
 * Mirrors demo stub surface: rings, todos, zoom, focus, device.
 */
export type PilotHighlightFixtures = {
  /** Replace current fixture rings with these (empty + no todos = clear). */
  rings?: readonly PilotFixtureRing[];
  /** Optional floating todo list (demo-dock language, simplified). */
  todos?: readonly string[];
  /** 0-based index of the "current" todo row (others before it = done). */
  todoIndex?: number;
  /** Optional title above the todo list. */
  todoTitle?: string;
  /** Todo dock side. Default `right`. */
  todoPos?: "left" | "right";
  /**
   * How long fixtures stay visible (ms). `0` = until the next highlight /
   * clear. Default `30000` (30s) unless specified.
   */
  holdMs?: number;
  /**
   * Camera zoom toward a selector (demo parity: scrollIntoView + zoom badge).
   * Defaults the zoom target to {@link zoomSelector}, else the last ring's
   * selector (or a ring that sets its own `zoom`). Cleared on `clear: true`
   * or when holdMs expires (if zoomOut).
   */
  zoom?: number;
  /** Element to zoom toward when {@link zoom} is set (defaults to last ring). */
  zoomSelector?: string;
  /** When false, keep zoom after fixtures clear/expire. Default true. */
  zoomOut?: boolean;
  /**
   * Viewport / device fixture (`mobile` | `tablet` | `desktop`, or a full
   * {@link DeviceState}). Applied via Playwright `setViewportSize`.
   */
  device?: DevicePreset | DeviceState;
  /** Drop every agent fixture ring/todo/focus/zoom immediately. */
  clear?: boolean;
};

/**
 * Paint (or clear) agent-authored highlight fixtures on the live page.
 * Multi-ring + optional todo strip + zoom/focus/device - the Pilot equivalent
 * of Block `stubBefore` narration in `waygraph demo`.
 * Does not import `cli.ts` (see file header).
 */
export async function showPilotFixtures(
  page: Page,
  fixtures: PilotHighlightFixtures,
): Promise<{ painted: number; missing: string[] }> {
  await ensureInstalled(page);
  const holdMs =
    fixtures.clear === true
      ? 0
      : fixtures.holdMs === undefined
        ? 30_000
        : Math.max(0, fixtures.holdMs);
  const rings = (fixtures.clear ? [] : (fixtures.rings ?? [])).map((r) => {
    const tone = normalizeHighlightTone(r.tone);
    const size = normalizeHighlightSize(r.size);
    const weight = normalizeHighlightWeight(r.weight);
    const caption: {
      label: string;
      tone: HighlightTone;
      detail?: string;
      tag?: string;
    } = { label: r.label, tone };
    if (r.detail) caption.detail = r.detail;
    if (r.tag) caption.tag = r.tag;
    const label = formatHighlightCaption(caption);
    return {
      selector: r.selector,
      label,
      tone,
      size,
      weight,
      color: typeof r.color === "string" && r.color.trim() ? r.color.trim() : "",
      zoom:
        typeof r.zoom === "number" && Number.isFinite(r.zoom) && r.zoom > 0
          ? r.zoom
          : undefined,
      zoomOut: r.zoomOut,
      focus: r.focus === true,
    };
  });
  const todos = fixtures.clear ? [] : (fixtures.todos ?? []);
  const todoIndex = fixtures.todoIndex ?? 0;
  const todoTitle = fixtures.todoTitle ?? "Plan";
  const todoPos = fixtures.todoPos === "left" ? "left" : "right";

  // Effective zoom: phase zoom, else last ring that authored zoom.
  let zoom =
    fixtures.clear === true
      ? 1
      : typeof fixtures.zoom === "number" && Number.isFinite(fixtures.zoom)
        ? fixtures.zoom
        : 1;
  let zoomSelector =
    fixtures.zoomSelector ??
    (rings.length > 0 ? rings[rings.length - 1]!.selector : undefined);
  let zoomOut = fixtures.zoomOut !== false;
  if (!fixtures.clear && zoom <= 1.001) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]!;
      if (r.zoom !== undefined && r.zoom > 1.001) {
        zoom = r.zoom;
        zoomSelector = r.selector;
        if (r.zoomOut !== undefined) zoomOut = r.zoomOut !== false;
        break;
      }
    }
  } else if (!fixtures.clear) {
    // Phase zoomOut can still be overridden by the targeted ring.
    const hit = rings.find((r) => r.selector === zoomSelector);
    if (hit?.zoomOut !== undefined) zoomOut = hit.zoomOut !== false;
  }

  // Device viewport (Node-side) before paint so rings land on the new size.
  if (fixtures.clear === true) {
    // Leave viewport alone on clear - only drop overlays.
  } else if (fixtures.device !== undefined) {
    const d = resolveDeviceState(fixtures.device);
    if (d) {
      await page
        .setViewportSize({
          width: Math.max(200, Math.floor(d.viewport.width)),
          height: Math.max(200, Math.floor(d.viewport.height)),
        })
        .catch(() => {});
    }
  }

  const deviceLabel =
    fixtures.clear === true
      ? ""
      : fixtures.device === undefined
        ? ""
        : typeof fixtures.device === "string"
          ? fixtures.device
          : fixtures.device.preset || "device";

  return page
    .evaluate(
      ({
        rings,
        todos,
        todoIndex,
        todoTitle,
        todoPos,
        holdMs,
        zoom,
        zoomSelector,
        zoomOut,
        clearAll,
        deviceLabel,
      }) => {
        const w = window as unknown as {
          __wgPilotFxHideTimer?: ReturnType<typeof setTimeout>;
          __wgPilotFxClear?: () => void;
          __wgPilotFxZoomOutOnHide?: boolean;
        };
        if (w.__wgPilotFxHideTimer) clearTimeout(w.__wgPilotFxHideTimer);

        const clearFocus = () => {
          const veil = document.getElementById("wg-pilot-fx-focus");
          if (!veil) return;
          veil.classList.remove("wg-in");
          setTimeout(() => {
            const v = document.getElementById("wg-pilot-fx-focus");
            if (v && !v.classList.contains("wg-in")) v.remove();
          }, 320);
        };
        const applyFocus = (box: { x: number; y: number; width: number; height: number }) => {
          let veil = document.getElementById("wg-pilot-fx-focus");
          if (!veil) {
            veil = document.createElement("div");
            veil.id = "wg-pilot-fx-focus";
            document.documentElement.appendChild(veil);
          }
          const pad = 10;
          veil.style.left = `${Math.max(0, box.x - pad)}px`;
          veil.style.top = `${Math.max(0, box.y - pad)}px`;
          veil.style.width = `${Math.max(8, box.width + pad * 2)}px`;
          veil.style.height = `${Math.max(8, box.height + pad * 2)}px`;
          void veil.offsetWidth;
          veil.classList.add("wg-in");
        };
        const setZoomBadge = (scale: number) => {
          const level = Number.isFinite(scale) && scale > 0 ? scale : 1;
          let badge = document.getElementById("wg-pilot-fx-zoom");
          if (!badge) {
            badge = document.createElement("div");
            badge.id = "wg-pilot-fx-zoom";
            document.documentElement.appendChild(badge);
          }
          const zoomed = level > 1.001 || level < 0.999;
          badge.dataset.zoomed = zoomed ? "1" : "0";
          badge.innerHTML =
            '<span class="wg-pilot-fx-zoom-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fde68a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>' +
            `<span class="wg-pilot-fx-zoom-val">${level.toFixed(2)}\u00d7</span>`;
        };
        const clearZoom = () => {
          // Undo any leftover CSS-scale from older Pilot zoom path.
          const root = document.documentElement;
          root.style.removeProperty("transform");
          root.style.removeProperty("transform-origin");
          root.style.removeProperty("transition");
          document.getElementById("wg-pilot-fx-zoom")?.remove();
        };
        const setDeviceChip = (label: string) => {
          document.getElementById("wg-pilot-fx-device")?.remove();
          if (!label) return;
          const chip = document.createElement("div");
          chip.id = "wg-pilot-fx-device";
          chip.dataset.preset = label;
          chip.textContent = `device \u00b7 ${label}`;
          document.documentElement.appendChild(chip);
        };

        w.__wgPilotFxZoomOutOnHide = zoomOut;
        const clearFx = () => {
          document.querySelectorAll(".wg-pilot-fx-ring, .wg-pilot-fx-label").forEach((el) => el.remove());
          document.getElementById("wg-pilot-fx-todos")?.remove();
          clearFocus();
          if (w.__wgPilotFxZoomOutOnHide !== false || clearAll) clearZoom();
          if (clearAll) {
            document.getElementById("wg-pilot-fx-device")?.remove();
            clearZoom();
          }
        };
        w.__wgPilotFxClear = clearFx;
        clearFx();
        if (clearAll) {
          return { painted: 0, missing: [] as string[] };
        }

        const missing: string[] = [];
        let painted = 0;
        let focusBox: { x: number; y: number; width: number; height: number } | null = null;

        for (const ring of rings) {
          const el = document.querySelector(ring.selector);
          if (!el) {
            missing.push(ring.selector);
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            missing.push(ring.selector);
            continue;
          }
          const pad = ring.size === "sm" ? 3 : ring.size === "lg" ? 10 : 6;
          const ringEl = document.createElement("div");
          ringEl.className = "wg-pilot-fx-ring";
          ringEl.dataset.tone = ring.tone;
          ringEl.dataset.size = ring.size;
          ringEl.style.left = `${rect.left - pad}px`;
          ringEl.style.top = `${rect.top - pad}px`;
          ringEl.style.width = `${Math.max(4, rect.width + pad * 2)}px`;
          ringEl.style.height = `${Math.max(4, rect.height + pad * 2)}px`;
          ringEl.style.opacity = "1";
          const labelEl = document.createElement("div");
          labelEl.className = "wg-pilot-fx-label";
          labelEl.dataset.tone = ring.tone;
          labelEl.dataset.size = ring.size;
          labelEl.dataset.weight = ring.weight;
          labelEl.textContent = ring.label;
          labelEl.style.opacity = "1";
          if (ring.color) {
            labelEl.style.color = ring.color;
          }
          document.documentElement.appendChild(ringEl);
          document.documentElement.appendChild(labelEl);
          const lw = labelEl.offsetWidth;
          const lh = labelEl.offsetHeight;
          let labelLeft = rect.left - pad;
          let labelTop = rect.top - pad + rect.height + pad * 2 + 8;
          if (labelTop + lh > window.innerHeight - 6) labelTop = rect.top - pad - lh - 8;
          if (labelTop < 6) labelTop = 6;
          if (labelLeft + lw > window.innerWidth - 6) {
            labelLeft = Math.max(6, window.innerWidth - 6 - lw);
          }
          if (labelLeft < 6) labelLeft = 6;
          labelEl.style.left = `${labelLeft}px`;
          labelEl.style.top = `${labelTop}px`;
          painted += 1;
          if (ring.focus) {
            focusBox = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          }
        }

        if (todos.length > 0) {
          const dock = document.createElement("div");
          dock.id = "wg-pilot-fx-todos";
          dock.dataset.pos = todoPos;
          const title = document.createElement("div");
          title.className = "wg-pilot-fx-todo-title";
          title.textContent = todoTitle;
          dock.appendChild(title);
          const ol = document.createElement("ol");
          todos.forEach((text, i) => {
            const li = document.createElement("li");
            li.textContent = text;
            if (i < todoIndex) li.className = "wg-pilot-fx-todo-done";
            else if (i === todoIndex) li.className = "wg-pilot-fx-todo-now";
            ol.appendChild(li);
          });
          dock.appendChild(ol);
          document.documentElement.appendChild(dock);
        }

        if (focusBox) applyFocus(focusBox);

        if (zoom > 1.001 && zoomSelector) {
          const target = document.querySelector(zoomSelector);
          if (target) {
            target.scrollIntoView({
              block: "center",
              inline: "center",
              behavior: "instant" as ScrollBehavior,
            });
            // Re-apply focus after scroll so the cutout tracks the new rect.
            if (focusBox) {
              const r = target.getBoundingClientRect();
              applyFocus({ x: r.left, y: r.top, width: r.width, height: r.height });
            }
            setZoomBadge(zoom);
          } else {
            missing.push(zoomSelector);
          }
        } else if (zoom > 1.001) {
          setZoomBadge(zoom);
        }

        if (deviceLabel) setDeviceChip(deviceLabel);

        if (
          holdMs > 0 &&
          (painted > 0 || todos.length > 0 || zoom > 1.001 || !!deviceLabel)
        ) {
          w.__wgPilotFxHideTimer = setTimeout(() => clearFx(), holdMs);
        }
        return { painted, missing };
      },
      {
        rings,
        todos,
        todoIndex,
        todoTitle,
        todoPos,
        holdMs,
        zoom,
        zoomSelector: zoomSelector ?? "",
        zoomOut,
        clearAll: fixtures.clear === true,
        deviceLabel,
      },
    )
    .catch(() => ({ painted: 0, missing: rings.map((r) => r.selector) }));
}

/** Minimal shape needed to render the graph tree - matches WaygraphGraph. */
export interface PilotOverlayGraph {
  nodes: readonly { checkpoint: string }[];
  edges: readonly { block: string; from: string; to: string; kind: "nav" | "action" }[];
}

export interface PilotOverlayInfo {
  sessionId: string | undefined;
  snapshot: SessionSnapshot;
  /**
   * The WHOLE project's graph, not just what's reachable from the current
   * page - real, direct user request: "i have a button where it shows all
   * the nodes like a node tree stuff". Optional so a caller that doesn't
   * have it handy (or doesn't want the extra payload every call) can omit
   * it; the "All nodes" tab just shows nothing until one arrives.
   */
  graph?: PilotOverlayGraph;
}

/**
 * Refreshes the badge text and the (possibly-collapsed) panel's two tabs
 * ("Here" - current live menu; "All nodes" - whole project graph as a
 * tree). Never throws - a page mid-navigation when this fires is a real,
 * expected timing case, not an error worth failing the caller's own real
 * operation over.
 */
export async function updatePilotOverlay(page: Page, info: PilotOverlayInfo): Promise<void> {
  await ensureInstalled(page);
  await page
    .evaluate(
      async ({ sessionId, snapshot, graph }) => {
        const badge = document.getElementById("wg-pilot-badge");
        const current = document.getElementById("wg-pilot-panel-current");
        const graphPanel = document.getElementById("wg-pilot-panel-graph");
        if (!badge || !current || !graphPanel) return;
        const idPart = sessionId ? `session ${sessionId}` : "no session id";
        badge.textContent = `Waygraph Pilot - ${idPart} - ${snapshot.here ?? "(unknown)"}`;
        const totalEdges = snapshot.sections.reduce((n, s) => n + s.edges.length, 0);
        if (totalEdges === 0) {
          current.innerHTML = '<div class="wg-pilot-empty">No moves from here right now.</div>';
        } else {
          current.innerHTML = snapshot.sections
            .map((section) => {
              const rows = section.edges
                .map((edge) => {
                  const desc = edge.description ? ` - ${edge.description}` : "";
                  const label = edge.label ? ` (${edge.label})` : "";
                  return `<div class="wg-pilot-edge">[${edge.index}] <span class="wg-pilot-kind">${edge.kind}</span> ${edge.block}${label} -&gt; ${edge.to}${desc}</div>`;
                })
                .join("");
              return `<div class="wg-pilot-section">${section.title}</div>${rows}`;
            })
            .join("");
        }
        if (!graph || graph.nodes.length === 0) {
          graphPanel.innerHTML = '<div class="wg-pilot-empty">No graph data yet.</div>';
          return;
        }
        // Flat indented-text tree - the ORIGINAL "All nodes" rendering.
        // Real, direct user correction: "i also dont like the all node
        // stuff. ther should be a 2d version" - kept only as a fallback for
        // when Mermaid genuinely can't load (e.g. offline), not the primary
        // rendering anymore.
        const renderTextTree = () => {
          graphPanel.innerHTML = graph.nodes
            .map((node) => {
              const outgoing = graph.edges.filter((e) => e.from === node.checkpoint || e.from === "*");
              const rows = outgoing.length
                ? outgoing
                    .map(
                      (e) =>
                        `<div class="wg-pilot-graph-edge"><span class="wg-pilot-kind">${e.kind}</span> ${e.block} -&gt; ${e.to}</div>`,
                    )
                    .join("")
                : '<div class="wg-pilot-graph-edge wg-pilot-empty">(no outgoing edges)</div>';
              const here = node.checkpoint === snapshot.here ? " (here)" : "";
              return `<div class="wg-pilot-graph-node"><div class="wg-pilot-graph-checkpoint">${node.checkpoint}${here}</div>${rows}</div>`;
            })
            .join("");
        };
        try {
          const w = window as unknown as {
            mermaid?: {
              initialize: (opts: Record<string, unknown>) => void;
              render: (id: string, src: string) => Promise<{ svg: string }>;
            };
            __wgMermaidLoadPromise?: Promise<unknown>;
          };
          if (!w.mermaid) {
            if (!w.__wgMermaidLoadPromise) {
              w.__wgMermaidLoadPromise = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
                script.onload = () => resolve(undefined);
                script.onerror = () => reject(new Error("mermaid script failed to load"));
                document.head.appendChild(script);
              });
            }
            await w.__wgMermaidLoadPromise;
          }
          if (!w.mermaid) throw new Error("mermaid did not attach to window after load");
          // Real, direct user request: "left to right stuff. maybe mermaid?
          // with square ish arrows???" - LR layout, linear (non-curvy) edges.
          w.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose", flowchart: { curve: "linear" } });
          const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
          // Every Nav Block gets a `from:"*"` wildcard edge for pathfinding
          // (see auto-explore.ts's own isUrlNav comment). Real, screenshot-
          // confirmed finding, TWICE over:
          // 1. Collapsing all of these into one shared "Anywhere" hub node
          //    still broke the layout - ~9 of 10 Checkpoints have their own
          //    nav edge, so nearly every node ends up one hop from that hub
          //    and dagre stacks them in a single rank/column ("it dones't
          //    look left to right").
          // 2. Dropping them entirely (no edges, just a footnote) fixed the
          //    layout but then hid real connectivity - a node like Settings
          //    that has ONLY a nav edge looked like a disconnected orphan
          //    ("the all nodes doesn't even show the navs block... whre is
          //    settings there").
          // Neither extreme is right: a wildcard nav edge isn't really a
          // flow TRANSITION (it doesn't come from any one specific screen,
          // it's global infrastructure - the persistent sidebar), so it
          // doesn't belong in the layout-driving edge set at all, but the
          // fact that a node is directly nav-reachable is still real
          // information worth showing. Marked on the node's own label
          // instead of as a graph edge - visible on every affected node,
          // adds zero layout-warping connectivity.
          const nonWildcard = graph.edges.filter((e) => e.from !== "*");
          const navReachable = new Set(graph.edges.filter((e) => e.from === "*").map((e) => e.to));
          // Real, direct user finding (screenshot-confirmed): a self-loop
          // edge (an action that stays on the same Checkpoint, e.g.
          // "fill-email -> SignIn") renders as a spiral squiggle Mermaid
          // draws back into the same node - with several per node (every
          // fill-* / select-* action), these dominated the diagram and
          // broke the left-to-right layout dagre otherwise produces cleanly
          // for a real DAG of inter-Checkpoint transitions. Self-loops add
          // no flow information anyway (the "Here" tab already lists every
          // action from wherever you are) - excluded from the graph itself,
          // kept only as a "(+N)" count on the node label so the count
          // isn't silently lost.
          const selfLoopCounts = new Map<string, number>();
          for (const e of nonWildcard) {
            if (e.from === e.to) selfLoopCounts.set(e.from, (selfLoopCounts.get(e.from) ?? 0) + 1);
          }
          const specific = nonWildcard.filter((e) => e.from !== e.to);
          const lines = ["graph LR"];
          for (const node of graph.nodes) {
            const id = sanitize(node.checkpoint);
            const here = node.checkpoint === snapshot.here;
            const loops = selfLoopCounts.get(node.checkpoint);
            const nav = navReachable.has(node.checkpoint) ? " [nav]" : "";
            const suffix = `${here ? " (here)" : ""}${loops ? ` (+${loops})` : ""}${nav}`;
            lines.push(`  ${id}["${node.checkpoint}${suffix}"]`);
            if (here) lines.push(`  style ${id} stroke:#7C3AED,stroke-width:3px`);
          }
          for (const e of specific) {
            lines.push(`  ${sanitize(e.from)} -->|${e.block}| ${sanitize(e.to)}`);
          }
          const { svg } = await w.mermaid.render(`wg-mermaid-${Date.now()}`, lines.join("\n"));
          graphPanel.innerHTML =
            svg + `<div class="wg-pilot-graph-note">[nav] = also directly reachable via sidebar/URL from anywhere (not drawn as an edge - see the "Here" tab for what's live on this page).</div>`;
          // Real, direct user request: "i hope it is zoomed to the current
          // node" - the diagram is usually bigger than the panel, so scroll
          // (not zoom - the SVG itself stays real size, legible) the "here"
          // node into view instead of leaving it wherever dagre placed it.
          const hereId = snapshot.here ? sanitize(snapshot.here) : null;
          const hereEl = hereId ? graphPanel.querySelector(`[id^="flowchart-${hereId}-"]`) : null;
          hereEl?.scrollIntoView({ block: "center", inline: "center" });
        } catch {
          renderTextTree();
        }
      },
      { sessionId: info.sessionId, snapshot: info.snapshot, graph: info.graph ?? null },
    )
    .catch(() => {});
}
