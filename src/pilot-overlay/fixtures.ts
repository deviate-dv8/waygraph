// Split out of the former 950-line pilot-overlay.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { formatHighlightCaption, normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight, resolveDeviceState, resolveTodoDockUi } from "../highlights.js";
import type { DevicePreset, DeviceState, HighlightTone, TodoDockUiOpts } from "../highlights.js";
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
  const todoUi = resolveTodoDockUi(fixtures.todoUi ?? null);

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
        todoUi,
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
          const WINDOW = todoUi.cap > 0 ? todoUi.cap : 5;
          const compact = todoUi.compact !== false && todos.length > WINDOW;
          if (compact) dock.dataset.compact = "1";
          let start = 0;
          let end = todos.length;
          if (compact) {
            start = Math.max(0, todoIndex - Math.floor((WINDOW - 1) / 2));
            end = Math.min(todos.length, start + WINDOW);
            start = Math.max(0, end - WINDOW);
          }
          const ol = document.createElement("ol");
          todos.forEach((text, i) => {
            const li = document.createElement("li");
            li.textContent = text;
            if (i < todoIndex) li.className = "wg-pilot-fx-todo-done";
            else if (i === todoIndex) li.className = "wg-pilot-fx-todo-now";
            if (compact && (i < start || i >= end)) li.classList.add("wg-todo-fold");
            ol.appendChild(li);
          });
          dock.appendChild(ol);
          if (compact && todos.length - (end - start) > 0) {
            const more = document.createElement("div");
            more.className = "wg-todo-more";
            more.textContent = "+" + (todos.length - (end - start)) + " more";
            dock.appendChild(more);
          }
          document.documentElement.appendChild(dock);
        }

        if (focusBox) applyFocus(focusBox);

        // Dim todos under rings / focus so captions stay readable.
        const dockEl = document.getElementById("wg-pilot-fx-todos");
        if (dockEl && todoUi.behindRing !== false && (painted > 0 || focusBox)) {
          dockEl.classList.add("wg-todo-behind");
        }

        // Collision flip: if a painted ring intersects the dock, flip side once.
        if (dockEl && todoUi.collision !== false && painted > 0) {
          const firstRing = document.querySelector(".wg-pilot-fx-ring");
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
        todoUi,
      },
    )
    .catch(() => ({ painted: 0, missing: rings.map((r) => r.selector) }));
}
