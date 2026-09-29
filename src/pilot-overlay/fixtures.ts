// Split out of the former 950-line pilot-overlay.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { buildTodoDock, formatHighlightCaption, normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight, resolveDeviceState, resolveTodoDockUi } from "../highlights.js";
import type { BannerPos, BannerUiOpts, DevicePreset, DeviceState, HighlightTone, TodoDockUiOpts, TodoListStyle, WaygraphTodoGroupInput } from "../highlights.js";
import { ensureInstalled } from "./shell.js";
import type { Page } from "@playwright/test";

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
  /** Presentation: `sequential` (default, arrow walkthrough) | `checklist` | `bullets`. Same as ctx.todoStyle. */
  todoStyle?: TodoListStyle;
  /** Multiple titled lists (FR/Scenarios/ACs, same as ctx.todoGroups) - replaces {@link todos} when set. */
  todoGroups?: readonly WaygraphTodoGroupInput[];
  /**
   * Todo-dock UX (compact / collision / behind-ring). Defaults smart-on;
   * pass false fields to opt out. See {@link TodoDockUiOpts}.
   */
  todoUi?: TodoDockUiOpts;
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
  /** Top banner title card (same as `ctx.title`). */
  title?: string;
  /** Banner position (same as `ctx.titlePos`). */
  titlePos?: BannerPos;
  /** Banner UX: collision / hidden (same as `ctx.bannerUi`). */
  bannerUi?: BannerUiOpts;
  /** Alias of {@link todoUi} - the name `ctx.todoDockUi` uses. */
  todoDockUi?: TodoDockUiOpts;
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
  const todoIndex = fixtures.todoIndex ?? 0;
  const todoTitle = fixtures.todoTitle ?? "Plan";
  const todoPos = fixtures.todoPos === "left" ? "left" : "right";
  const todoUi = resolveTodoDockUi(fixtures.todoUi ?? null);
  // Real TodoDockState (groups/style), same builder the demo runner uses - not a flat string[]
  // re-implementation, so a Block/agent that authors ctx.todoGroups()/ctx.todoStyle() looks the
  // same on Pilot as it does in `waygraph demo`.
  const todoDock = fixtures.clear
    ? undefined
    : buildTodoDock({
        todos: fixtures.todos,
        todoIndex,
        todoTitle,
        todoStyle: fixtures.todoStyle,
        todoGroups: fixtures.todoGroups,
        todoPos,
      });
  const todoGroups = todoDock?.groups ?? [];

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

  // Device viewport - same runner/device-stage.js + inpage/device.js every other surface uses
  // (toast + persistent chip + touch mode), not a separate, simpler Pilot-only chip.
  if (fixtures.clear === true) {
    const { applyDeviceToPage } = await import("../runner/device-stage.js");
    await applyDeviceToPage(page, undefined, "clear").catch(() => {});
  } else if (fixtures.device !== undefined) {
    const d = resolveDeviceState(fixtures.device);
    if (d) {
      const [{ applyDeviceToPage }, { installDevice }] = await Promise.all([
        import("../runner/device-stage.js"),
        import("../runner/inpage/device.js"),
      ]);
      await page.evaluate(installDevice, {}).catch(() => {});
      await applyDeviceToPage(page, d, "set").catch(() => {});
    }
  }

  const bannerTitle = fixtures.clear ? undefined : fixtures.title;
  const bannerPos = fixtures.clear ? undefined : fixtures.titlePos;
  const bannerHidden = !!fixtures.clear || !!fixtures.bannerUi?.hidden;
  const bannerCollision = fixtures.bannerUi?.collision !== false;

  // Same #wg-banner installer the demo runner uses (runner/inpage/banner.js) - not a separate
  // re-implementation. `tag: "waygraph pilot"` is the only Pilot-specific bit.
  if (bannerTitle !== undefined || bannerHidden) {
    const { installBanner } = await import("../runner/inpage/banner.js");
    await page
      .evaluate(installBanner, {
        title: bannerTitle,
        bannerPos: bannerPos || "left",
        bannerUi: { hidden: bannerHidden, collision: bannerCollision, ...(bannerPos ? { pos: bannerPos } : {}) },
        tag: "waygraph pilot",
      })
      .catch(() => {});
  }

  return page
    .evaluate(
      ({
        rings,
        todoGroups,
        todoPos,
        holdMs,
        zoom,
        zoomSelector,
        zoomOut,
        clearAll,
        todoUi,
      }) => {
        const w = window as unknown as {
          __wgPilotFxHideTimer?: ReturnType<typeof setTimeout>;
          __wgPilotFxClear?: () => void;
          __wgPilotFxZoomOutOnHide?: boolean;
        };
        if (w.__wgPilotFxHideTimer) clearTimeout(w.__wgPilotFxHideTimer);

        const clearFocus = () => {
          const veil = __wgById("wg-pilot-fx-focus");
          if (!veil) return;
          veil.classList.remove("wg-in");
          setTimeout(() => {
            const v = __wgById("wg-pilot-fx-focus");
            if (v && !v.classList.contains("wg-in")) v.remove();
          }, 320);
        };
        const applyFocus = (box: { x: number; y: number; width: number; height: number }) => {
          let veil = __wgById("wg-pilot-fx-focus");
          if (!veil) {
            veil = document.createElement("div");
            veil.id = "wg-pilot-fx-focus";
            __wgAdd(veil);
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
          let badge = __wgById("wg-pilot-fx-zoom");
          if (!badge) {
            badge = document.createElement("div");
            badge.id = "wg-pilot-fx-zoom";
            __wgAdd(badge);
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
          __wgById("wg-pilot-fx-zoom")?.remove();
        };
        w.__wgPilotFxZoomOutOnHide = zoomOut;
        const clearFx = () => {
          __wgQA('[id^="wg-fx-ring-"]').forEach((el) => el.remove());
          __wgById("wg-pilot-fx-todos")?.remove();
          clearFocus();
          if (w.__wgPilotFxZoomOutOnHide !== false || clearAll) clearZoom();
          if (clearAll) {
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

        // Paint through the SAME shared ring primitive the demo/auto singleton ring uses
        // (window.__wgPaintRingAt, installed by runner/inpage/core.js's installCore - see
        // ensureInstalled) - one ring implementation, not a separate DOM-building copy here.
        rings.forEach((ring, i) => {
          const el = document.querySelector(ring.selector);
          if (!el) {
            missing.push(ring.selector);
            return;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            missing.push(ring.selector);
            return;
          }
          const box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          const ringId = `wg-fx-ring-${i}`;
          const labelId = `wg-fx-ring-${i}-label`;
          if (window.__wgPaintRingAt) {
            window.__wgPaintRingAt(ringId, labelId, box, ring.label, ring.tone, {
              size: ring.size,
              weight: ring.weight,
              color: ring.color,
            });
          }
          painted += 1;
          if (ring.focus) focusBox = box;
        });

        // Real TodoDockState groups (same shape/builder the demo runner uses) - a group's own
        // style (sequential/checklist/bullets) and its own done/current flags drive rendering here,
        // not a re-derived index over a flattened string list.
        const flat = todoGroups.flatMap((g) => g.items);
        if (flat.length > 0) {
          const dock = document.createElement("div");
          dock.id = "wg-pilot-fx-todos";
          dock.dataset.pos = todoPos;
          const WINDOW = todoUi.cap > 0 ? todoUi.cap : 5;
          const compact = todoUi.compact !== false && flat.length > WINDOW;
          if (compact) dock.dataset.compact = "1";
          const currentFlat = Math.max(0, flat.findIndex((it) => it.current));
          let start = 0;
          let end = flat.length;
          if (compact) {
            start = Math.max(0, currentFlat - Math.floor((WINDOW - 1) / 2));
            end = Math.min(flat.length, start + WINDOW);
            start = Math.max(0, end - WINDOW);
          }
          let flatIdx = 0;
          let shown = 0;
          for (const group of todoGroups) {
            if (group.items.length === 0) continue;
            if (group.title) {
              const title = document.createElement("div");
              title.className = "wg-pilot-fx-todo-title";
              title.textContent = group.title;
              dock.appendChild(title);
            }
            const ol = document.createElement("ol");
            const marker = group.style === "checklist" ? (done: boolean) => (done ? "\u2611 " : "\u2610 ") : group.style === "bullets" ? () => "\u2022 " : () => "";
            for (const item of group.items) {
              const i = flatIdx++;
              const li = document.createElement("li");
              li.textContent = marker(!!item.done) + item.text;
              if (item.done) li.className = "wg-pilot-fx-todo-done";
              else if (item.current) li.className = "wg-pilot-fx-todo-now";
              if (compact && (i < start || i >= end)) li.classList.add("wg-todo-fold");
              else shown++;
              ol.appendChild(li);
            }
            dock.appendChild(ol);
          }
          if (compact && flat.length - shown > 0) {
            const more = document.createElement("div");
            more.className = "wg-todo-more";
            more.textContent = "+" + (flat.length - shown) + " more";
            dock.appendChild(more);
          }
          __wgAdd(dock);
        }

        if (focusBox) applyFocus(focusBox);

        // Dim todos under rings / focus so captions stay readable.
        const dockEl = __wgById("wg-pilot-fx-todos");
        if (dockEl && todoUi.behindRing !== false && (painted > 0 || focusBox)) {
          dockEl.classList.add("wg-todo-behind");
        }

        // Collision flip: if a painted ring intersects the dock, flip side once.
        if (dockEl && todoUi.collision !== false && painted > 0) {
          const firstRing = __wgQ('[id^="wg-fx-ring-"]:not([id$="-label"])');
          if (firstRing) {
            const rr = firstRing.getBoundingClientRect();
            const dr = dockEl.getBoundingClientRect();
            const hit = !(rr.right < dr.left || rr.left > dr.right || rr.bottom < dr.top || rr.top > dr.bottom);
            if (hit) {
              dockEl.dataset.pos = dockEl.dataset.pos === "right" ? "left" : "right";
            }
          }
        }

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

        if (
          holdMs > 0 &&
          (painted > 0 || todoGroups.some((g) => g.items.length > 0) || zoom > 1.001)
        ) {
          w.__wgPilotFxHideTimer = setTimeout(() => clearFx(), holdMs);
        }
        return { painted, missing };
      },
      {
        rings,
        todoGroups,
        todoPos,
        holdMs,
        zoom,
        zoomSelector: zoomSelector ?? "",
        zoomOut,
        clearAll: fixtures.clear === true,
        todoUi,
      },
    )
    .catch(() => ({ painted: 0, missing: rings.map((r) => r.selector) }));
}
