/**
 * Block stubBefore / stubAfter / stubOnError + flow highlightFixtures + demo slides.
 * Demo narration only - never affects runGraph pass/fail.
 *
 * Stubs are **open block lifecycles** - prefer `stubBefore(ctx) { ... }`, not a
 * closed slot object. Inside the fn authors set fixtures (todos, zoom) and rings.
 * Object maps remain a shorthand for highlight-only slots.
 *
 * Lifecycle (stubs) ≠ yap slides: stubs are fill/after/error rings tied to the block;
 * slides are multi-step captions with Next between them (long-process explain).
 *
 * All fixture shapes share optional {@link FixtureDurationFields} so demo dwell
 * before advancing is authored the same way on stubs, flow fixtures, and slides.
 */

import type { Block, Checkpoint } from "./types.js";

/** Shared dwell fields on stubs, fixtures, and yap slides. */
export type FixtureDurationFields = {
  /**
   * Min time this fixture stays visible before the demo advances.
   * - `true` - defaults (2000ms normal, {@link FixtureDurationFields.fastMode} or 600ms when --fast)
   * - `number` - override normal dwell ms
   * - omit / false - no authored dwell (caller keeps legacy timing)
   */
  duration?: boolean | number;
  /**
   * Dwell ms when demo `--fast` / gatesFast (only when {@link duration} is set).
   * Default 600.
   */
  fastMode?: number;
};

/**
 * One checklist row for episode planning (demo panel).
 * Set via {@link StubCtx.todos} / {@link StubCtx.todoIndex} inside the lifecycle.
 */
export type WaygraphTodoItem = {
  text: string;
  /**
   * Stable id for external asserts / redirects (Mailhog, deep links).
   * Stamped as `data-wg-todo-item` on the row.
   */
  id?: string;
  /** Alias for {@link WaygraphTodoItem.id}. */
  name?: string;
  /** Explicit done. If omitted, derived from todoIndex (index < todoIndex). */
  done?: boolean;
  /** Explicit current. If omitted, derived from todoIndex (index === todoIndex). */
  current?: boolean;
};

export type WaygraphTodoInput = string | WaygraphTodoItem;

/**
 * Dock list presentation:
 * - `sequential` - arrow on current, strike done (demo walkthrough)
 * - `checklist` - checkbox done/pending only (no current arrow; independent checks)
 * - `bullets` - flat bullet list (no arrow/checkbox; open notes / trimmed dock)
 */
export type TodoListStyle = "sequential" | "checklist" | "bullets";

/** One titled group in the floating todo dock (FR / Scenarios / ACs, etc.). */
export type WaygraphTodoGroupInput = {
  /** Stable group id -> `data-wg-todo-group`. */
  id?: string;
  /** Alias for {@link WaygraphTodoGroupInput.id}. */
  name?: string;
  /** Group heading shown above the items. */
  title?: string;
  /** Per-group style; falls back to dock default ({@link StubCtx.todoStyle}). */
  style?: TodoListStyle;
  items: readonly WaygraphTodoInput[];
  /** Sequential only: which item is current (0-based). */
  todoIndex?: number;
};

export type WaygraphTodoGroup = {
  id?: string;
  title?: string;
  style: TodoListStyle;
  items: WaygraphTodoItem[];
};

/** Full floating dock payload passed to the browser. */
export type TodoDockState = {
  /**
   * Stable dock id for external targeting after redirects
   * (`#wg-todo-dock[data-wg-todo-id="…"]`).
   */
  id?: string;
  /** Default style for groups that omit their own. */
  style: TodoListStyle;
  /** Single-list title when using {@link StubCtx.todos} + {@link StubCtx.todoTitle}. */
  title?: string;
  groups: WaygraphTodoGroup[];
  pos?: "left" | "right";
};

/** Options for compact {@link StubCtx.todos}(`id`, items, opts). */
export type WaygraphTodosOpts = {
  /** Dock heading. */
  title?: string;
  /** Current item index (0-based). */
  index?: number;
  /** `sequential` | `checklist` | `bullets`. */
  style?: TodoListStyle;
  /** Dock side. */
  pos?: "left" | "right";
  /**
   * Keep other docks with different ids (multi-todo). Default false —
   * one checklist at a time (setting todos replaces the previous dock).
   */
  parallel?: boolean;
};

/** Episode-level fixtures authored inside stubBefore/After/OnError(ctx). */
export type StubPhaseFixtures = {
  todos?: readonly WaygraphTodoInput[];
  /** Which todo is current (0-based). Rows before = done, after = pending. */
  todoIndex?: number;
  /** Heading above a single {@link StubCtx.todos} list. */
  todoTitle?: string;
  /**
   * Stable dock id (`data-wg-todo-id`) for external redirect asserts
   * (e.g. Mailhog -> back to app and still find the checklist).
   */
  todoId?: string;
  /** `sequential` (default), `checklist`, or `bullets`. */
  todoStyle?: TodoListStyle;
  /** Multiple titled lists (FR / Scenarios / ACs). Wins over bare todos when set. */
  todoGroups?: readonly WaygraphTodoGroupInput[];
  /**
   * Camera zoom (Screen Studio style) - scales the page toward the target /
   * cursor. Not element CSS zoom. Typical `1.25` .. `2`.
   */
  zoom?: number;
  /** Default zoomOut for rings (false = keep camera between rings). */
  zoomOut?: boolean;
  /** Top demo banner title (the purple "waygraph demo" card). */
  title?: string;
  /**
   * Floating checklist dock side. `left` | `right`.
   * Authored control (also click / WAYGRAPH_TODO_POS / --todo-left|right).
   */
  todoPos?: "left" | "right";
  /**
   * Viewport preset: `mobile` | `tablet` | `desktop` (default / clear).
   * Omit on later blocks = **keep** (same persist pattern as todos).
   */
  device?: DevicePreset | DeviceState;
  /** Explicit pixel viewport (wins over preset width/height when both set). */
  viewport?: DeviceViewport;
  /** Touch theater + Playwright touchscreen when true. */
  touch?: boolean;
  /** Portrait / landscape (swaps preset width/height). */
  orientation?: DeviceOrientation;
};

/** Named viewport presets (0.13+). */
export type DevicePreset = "mobile" | "tablet" | "desktop";

/** Explicit viewport box. */
export type DeviceViewport = {
  width: number;
  height: number;
  deviceScaleFactor?: number;
};

/**
 * Carried device fixture (todo-dock shaped persist).
 * Omit on a later step = keep; hideDevice/clearDevice/desktop = clear to desktop.
 */
export type DeviceState = {
  preset: DevicePreset;
  viewport: DeviceViewport;
  /** Playwright-ish: treat as mobile layout. */
  isMobile: boolean;
  /** Context needs hasTouch for touchscreen.tap (demo launches with hasTouch). */
  hasTouch: boolean;
  /** Demo gesture theater: finger cursor, tap/hold timing, prefer touchscreen. */
  touchMode: boolean;
  /** Viewport orientation (0.13.3+). Default derived from width/height. */
  orientation?: DeviceOrientation;
};

/** Portrait (tall) or landscape (wide). */
export type DeviceOrientation = "portrait" | "landscape";

/** Built-in preset sizes (CSS pixels) — stored in portrait for mobile/tablet. */
export const DEVICE_PRESETS: Record<DevicePreset, Omit<DeviceState, "touchMode"> & { touchMode?: boolean }> = {
  mobile: {
    preset: "mobile",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    isMobile: true,
    hasTouch: true,
    touchMode: true,
    orientation: "portrait",
  },
  tablet: {
    preset: "tablet",
    viewport: { width: 768, height: 1024, deviceScaleFactor: 2 },
    isMobile: true,
    hasTouch: true,
    touchMode: true,
    orientation: "portrait",
  },
  desktop: {
    preset: "desktop",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    isMobile: false,
    hasTouch: false,
    touchMode: false,
    orientation: "landscape",
  },
};

export function normalizeDevicePreset(raw: unknown): DevicePreset | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "mobile" || s === "phone" || s === "m") return "mobile";
  if (s === "tablet" || s === "pad" || s === "t") return "tablet";
  if (s === "desktop" || s === "desk" || s === "d" || s === "main") return "desktop";
  return undefined;
}

export function normalizeDeviceOrientation(raw: unknown): DeviceOrientation | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "portrait" || s === "port" || s === "tall" || s === "p") return "portrait";
  if (s === "landscape" || s === "land" || s === "wide" || s === "l") return "landscape";
  return undefined;
}

/** Infer orientation from box (square counts as landscape). */
export function orientationFromViewport(vp: DeviceViewport): DeviceOrientation {
  return vp.height > vp.width ? "portrait" : "landscape";
}

/**
 * Swap width/height so the viewport matches the requested orientation.
 * Preserves deviceScaleFactor. No-op when already oriented.
 */
export function applyOrientation(
  state: DeviceState,
  orientation: DeviceOrientation,
): DeviceState {
  const vp = { ...state.viewport };
  const current = orientationFromViewport(vp);
  if (current !== orientation) {
    const w = vp.width;
    vp.width = vp.height;
    vp.height = w;
  }
  return { ...state, viewport: vp, orientation };
}

/** Resolve a preset name or partial state into a full DeviceState. */
export function resolveDeviceState(
  input: DevicePreset | DeviceState | DeviceViewport | undefined,
  touchOverride?: boolean,
  orientationOverride?: DeviceOrientation,
): DeviceState | undefined {
  if (input === undefined) return undefined;
  let resolved: DeviceState | undefined;
  if (typeof input === "string") {
    const p = normalizeDevicePreset(input);
    if (!p) return undefined;
    const base = DEVICE_PRESETS[p];
    const touchMode = touchOverride !== undefined ? !!touchOverride : !!base.touchMode;
    resolved = {
      preset: base.preset,
      viewport: { ...base.viewport },
      isMobile: base.isMobile,
      hasTouch: base.hasTouch || touchMode,
      touchMode,
      orientation: base.orientation || orientationFromViewport(base.viewport),
    };
  } else if ("width" in input && "height" in input && !("preset" in input)) {
    const vp = input as DeviceViewport;
    const touchMode = touchOverride !== undefined ? !!touchOverride : true;
    const box = {
      width: Math.max(200, Math.floor(vp.width)),
      height: Math.max(200, Math.floor(vp.height)),
      ...(vp.deviceScaleFactor !== undefined
        ? { deviceScaleFactor: vp.deviceScaleFactor }
        : { deviceScaleFactor: 2 }),
    };
    resolved = {
      preset: "mobile",
      viewport: box,
      isMobile: true,
      hasTouch: true,
      touchMode,
      orientation: orientationFromViewport(box),
    };
  } else {
    const d = input as DeviceState;
    const preset = normalizeDevicePreset(d.preset) || "desktop";
    const base = DEVICE_PRESETS[preset];
    const touchMode =
      touchOverride !== undefined
        ? !!touchOverride
        : d.touchMode !== undefined
          ? !!d.touchMode
          : !!base.touchMode;
    const viewport = d.viewport
      ? {
          width: Math.max(200, Math.floor(d.viewport.width)),
          height: Math.max(200, Math.floor(d.viewport.height)),
          ...(d.viewport.deviceScaleFactor !== undefined
            ? { deviceScaleFactor: d.viewport.deviceScaleFactor }
            : base.viewport.deviceScaleFactor !== undefined
              ? { deviceScaleFactor: base.viewport.deviceScaleFactor }
              : {}),
        }
      : { ...base.viewport };
    resolved = {
      preset,
      viewport,
      isMobile: d.isMobile !== undefined ? !!d.isMobile : base.isMobile,
      hasTouch: d.hasTouch !== undefined ? !!d.hasTouch : base.hasTouch || touchMode,
      touchMode,
      orientation:
        normalizeDeviceOrientation(d.orientation) ||
        orientationFromViewport(viewport),
    };
  }
  if (!resolved) return undefined;
  const want =
    orientationOverride ||
    (typeof input === "object" && input && "orientation" in input
      ? normalizeDeviceOrientation((input as DeviceState).orientation)
      : undefined);
  if (want) return applyOrientation(resolved, want);
  if (!resolved.orientation) {
    resolved = {
      ...resolved,
      orientation: orientationFromViewport(resolved.viewport),
    };
  }
  return resolved;
}

/**
 * Carry-forward for device fixtures (mirror {@link applyTodoPhase}).
 * - clear: hideDevice / clearDevice / device("desktop") with clear intent
 * - set: author set device/viewport/touch this phase
 * - keep: omit - preserve previous (whole episode remain)
 */
export function applyDevicePhase(
  prev: DeviceState | undefined,
  phase: {
    deviceSync?: "set" | "clear" | "keep";
    device?: DeviceState;
  },
): { device: DeviceState | undefined; sync: "set" | "clear" | "keep" } {
  const sync =
    phase.deviceSync ||
    (phase.device ? "set" : "keep");
  if (sync === "clear") {
    return { device: resolveDeviceState("desktop", false), sync: "clear" };
  }
  if (sync === "set") {
    if (phase.device) return { device: phase.device, sync: "set" };
    return { device: resolveDeviceState("desktop", false), sync: "clear" };
  }
  return { device: prev, sync: "keep" };
}

/**
 * The `#wg-ring` / `#wg-ring-label` CSS (tone/size/weight variants) - the
 * actual visual language `cli.ts`'s own demo stepper paints with. Extracted
 * here (not left as a private `cli.ts` constant) so anything else wanting the
 * SAME "waygraph vision" ring can import pure CSS text, not the rendering
 * engine around it - `cli.ts` runs `main().catch(...)` unconditionally at
 * module load with no `import.meta.url` guard, so importing anything from it
 * is unsafe as a library dependency (see `pilot-overlay.ts`'s own doc
 * comment for the same reasoning re: the badge/panel). This file has always
 * been the pure, side-effect-free home for tone/size/weight - the CSS that
 * renders them belongs alongside it for the same reason. `cli.ts` imports
 * this constant instead of keeping its own duplicate copy.
 */
export const WAYGRAPH_RING_CSS =
  "#wg-ring{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "border:2.5px solid #7C3AED;border-radius:10px;" +
  // Opacity fade only - NEVER transition border-color/box-shadow. Tone swaps
  // (auto gray -> planned purple -> warning yellow) must snap instantly;
  // color transitions read as a muddy gray/purple/yellow morph on ring 2+.
  "box-shadow:0 0 0 4px rgba(124,58,237,.16);transition:opacity .3s ease;}" +
  // Planned (stubs / fixtures / YAP / instruction.highlights) = purple.
  // Automation (verify fallback, unmatched fill/click) = gray - operators
  // can ignore engine checks and watch purple + semantic tones.
  "#wg-ring[data-tone=planned]{border-color:#7C3AED;box-shadow:0 0 0 4px rgba(124,58,237,.16);}" +
  "#wg-ring[data-tone=auto]{border-color:#9CA3AF;box-shadow:0 0 0 4px rgba(156,163,175,.28);}" +
  "#wg-ring[data-tone=info]{border-color:#3B82F6;box-shadow:0 0 0 4px rgba(59,130,246,.22);}" +
  "#wg-ring[data-tone=warning]{border-color:#EAB308;box-shadow:0 0 0 4px rgba(234,179,8,.22);}" +
  "#wg-ring[data-tone=danger]{border-color:#EF4444;box-shadow:0 0 0 4px rgba(239,68,68,.22);}" +
  "#wg-ring[data-tone=success]{border-color:#22C55E;box-shadow:0 0 0 4px rgba(34,197,94,.22);}" +
  // Real, direct user request: a visible color distinction between a real
  // Playwright-driven action (auto gray, unchanged) and a pure DOM
  // inspection (this - orange).
  "#wg-ring[data-tone=orange]{border-color:#F97316;box-shadow:0 0 0 4px rgba(249,115,22,.22);}" +
  // A real element, not a ::after pseudo-element - a pseudo-element's
  // position is CSS-relative to the ring's own box (left:0 always meant
  // "the ring's own left edge"), so it had no way to be clamped back onto
  // screen when that box sat near a viewport edge - the label's text just
  // ran off, invisibly, with no overflow guard at all. A real sibling can
  // be measured (its actual rendered width) and repositioned in JS -
  // pushed back onto screen, same width, never shrunk. See
  // window.__wgPositionRing in cli.ts's own installOverlay.
  "#wg-ring-label{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "max-width:min(360px,70vw);white-space:normal;padding:6px 10px;border-radius:7px;background:#7C3AED;color:#fff;" +
  "font:600 12px/1.35 system-ui,sans-serif;transition:opacity .3s ease;}" +
  "#wg-ring-label[data-tone=planned]{background:#7C3AED;color:#fff;}" +
  "#wg-ring-label[data-tone=auto]{background:#6B7280;color:#fff;}" +
  "#wg-ring-label[data-tone=info]{background:#2563EB;color:#fff;}" +
  "#wg-ring-label[data-tone=warning]{background:#EAB308;color:#1c1917;}" +
  "#wg-ring-label[data-tone=danger]{background:#DC2626;color:#fff;}" +
  "#wg-ring-label[data-tone=success]{background:#16A34A;color:#fff;}" +
  "#wg-ring-label[data-tone=orange]{background:#EA580C;color:#fff;}" +
  // size: ring pad + label font; weight: label boldness
  "#wg-ring[data-size=sm]{border-width:1.5px;border-radius:8px;}" +
  "#wg-ring[data-size=lg]{border-width:4px;border-radius:12px;}" +
  "#wg-ring-label[data-size=sm]{font-size:10px;line-height:1.25;padding:4px 7px;border-radius:5px;}" +
  "#wg-ring-label[data-size=lg]{font-size:16px;line-height:1.35;padding:8px 14px;border-radius:9px;max-width:min(480px,85vw);}" +
  "#wg-ring-label[data-weight=bold]{font-weight:800;}" +
  "#wg-ring-label[data-weight=normal]{font-weight:600;}";

/** One named highlight slot on a block (selector + caption). */
export interface WaygraphHighlightStub extends FixtureDurationFields {
  selector: string;
  /** Primary caption line. */
  label: string;
  /** Extra caption line (ring / slide body). */
  detail?: string;
  /** Short badge, e.g. AC / BUG / GATE / YAP. */
  tag?: string;
  /**
   * Demo ring color + icon:
   * - `planned` purple (authored narration, default)
   * - `auto` gray (engine automation / verify fallback)
   * - `info` blue · `warning` yellow · `danger` red · `success` green
   */
  tone?: HighlightTone;
  /**
   * Ring padding + label font scale: `sm` | `md` (default) | `lg`.
   * Aliases: small/medium/large, s/m/l.
   */
  size?: HighlightSize;
  /**
   * Label font weight: `normal` (default) | `bold`.
   * Aliases: regular, strong.
   */
  weight?: HighlightWeight;
  /**
   * Camera zoom while this ring is up (Screen Studio style - page scales toward
   * the target / cursor). Typical `1.25` .. `2`. Cleared when the ring hides
   * unless `zoomOut: false`. Episode default: {@link StubCtx.zoom}.
   */
  zoom?: number;
  /**
   * When false, keep the camera zoomed after this ring (pan to the next target
   * instead of zooming out). Default true. Phase default: {@link StubCtx.zoomOut}.
   */
  zoomOut?: boolean;
  /**
   * Spotlight: dim the rest of the page, keep this target as the focal point.
   */
  focus?: boolean;
  /**
   * Deprecated no-op. Camera auto-centers on the ring target; host mouse is
   * ignored. Playwright's real mouse is driven to the centered target instead.
   */
  followMouse?: boolean;
  /** Alias for {@link WaygraphHighlightStub.followMouse} (no-op). */
  follow?: boolean;
  /**
   * Caption text color (CSS color). Overrides tone label color when set.
   * Aliases accepted at runtime: `color`, `labelColor`, `textColor`.
   */
  color?: string;
  /**
   * Move the demo cursor to the target while this ring is up (default true
   * for authored stub queues; set false to keep cursor hidden).
   */
  cursor?: boolean;
  /**
   * Optional link to a todo item id. When set, Method fill/click advances that
   * todo row instead of relying on stub array index (avoids password/submit/username
   * alphabetical reorder bugs).
   */
  todo?: string;
  /** Slot key from stubBefore/After map (e.g. "username") - set by resolver. */
  slotId?: string;
  /**
   * Pointer feel when touchMode is on (0.13+):
   * - `tap` - short press via touchscreen (default in touch mode)
   * - `hold` - long-press (~600ms) then release
   * - `click` - mouse click even in touch mode
   */
  gesture?: "tap" | "hold" | "click" | "swipe";
}

/** Flow fixture patch: label required; selector optional (inherits from stub). */
export type WaygraphHighlightFixture = Partial<Pick<WaygraphHighlightStub, "selector">> &
  Required<Pick<WaygraphHighlightStub, "label">> &
  Pick<
    WaygraphHighlightStub,
    | "detail"
    | "tag"
    | "tone"
    | "size"
    | "weight"
    | "zoom"
    | "zoomOut"
    | "focus"
    | "followMouse"
    | "follow"
    | "color"
    | "cursor"
    | "todo"
    | "gesture"
  > &
  FixtureDurationFields;

export type HighlightStubPhase = Record<string, WaygraphHighlightStub>;

/**
 * Open stub lifecycle context. Authors set rings + episode fixtures freely —
 * not restricted to returning a closed slot object.
 *
 * @example
 * stubBefore: (ctx) => {
 *   ctx.todos(["Enter email", "Enter password", "Click Sign in"]);
 *   ctx.todoIndex(0);
 *   ctx.zoom(1.35);
 *   ctx.highlights({
 *     email: { selector: "#email", label: "Email" },
 *     submit: { selector: "#login-button", label: "Sign in" },
 *   });
 * }
 * // Sequential plan: bump todoIndex in a later phase / later block's stubBefore
 * stubAfter: (ctx) => {
 *   ctx.todos(["Enter email", "Enter password", "Click Sign in"]);
 *   ctx.todoIndex(2);
 *   ctx.ring("inventory", { selector: ".inventory_list", label: "Landed" });
 * }
 */
export type StubCtx<Out extends Checkpoint<string> = Checkpoint<string>> = {
  /** Present after resolve (stubAfter). Undefined for stubBefore. */
  readonly out: Out | undefined;
  /** Present on stubOnError when the step threw. */
  readonly error: unknown | undefined;
  /** Replace named highlight rings for this phase. */
  highlights(slots: HighlightStubPhase): void;
  /** Set / overwrite one named ring. */
  ring(id: string, stub: WaygraphHighlightStub): void;
  /**
   * Floating checklist. Prefer the compact form:
   *   ctx.todos("login", ["Enter email", "Enter password"], { title: "Sign in", index: 0 })
   * Legacy: ctx.todos([...]); ctx.todoId(...); ctx.todoIndex(...); …
   * Default = one dock (setting todos replaces). Pass `{ parallel: true }` to keep others.
   */
  todos(items: readonly WaygraphTodoInput[]): void;
  todos(
    id: string,
    items: readonly WaygraphTodoInput[],
    opts?: WaygraphTodosOpts,
  ): void;
  /** Current checklist index (bump for sequential plans). */
  todoIndex(n: number): void;
  /** Heading above the single {@link StubCtx.todos} list. */
  todoTitle(text: string): void;
  /**
   * Stable dock id for external selectors after redirects
   * (`#wg-todo-dock[data-wg-todo-id="ep10-coverage"]`).
   */
  todoId(id: string): void;
  /**
   * Dock presentation: `sequential` (arrow walkthrough), `checklist`
   * (independent checkboxes), or `bullets` (flat • list, no progress marks).
   */
  todoStyle(style: TodoListStyle): void;
  /**
   * Multiple titled lists (e.g. Functional Requirements / Scenarios / ACs).
   * Replaces a bare {@link StubCtx.todos} list when set.
   */
  todoGroups(groups: readonly WaygraphTodoGroupInput[]): void;
  /**
   * Hide the floating todo dock. Omit todos on a later block = **keep** the
   * previous dock (carry forward). Only hideTodos / clearTodos / todos([]) clears it.
   */
  hideTodos(): void;
  /** Alias for {@link StubCtx.hideTodos}. */
  clearTodos(): void;
  /**
   * Viewport / device fixture (0.13+). `mobile` | `tablet` | `desktop`.
   * Omit on later blocks = **keep** (same persist as todos). Use
   * {@link StubCtx.hideDevice} / {@link StubCtx.clearDevice} to return to desktop.
   */
  device(preset: DevicePreset | DeviceState): void;
  /** Explicit CSS-pixel viewport (implies mobile-ish unless desktop-sized). */
  viewport(box: DeviceViewport): void;
  /** Enable / disable touch theater + touchscreen gestures. */
  touch(on?: boolean): void;
  /**
   * Rotate viewport to portrait or landscape (0.13.3+).
   * Keeps current preset; swaps width/height. Toast + lerp like device().
   */
  orientation(o: DeviceOrientation): void;
  /** Alias for {@link StubCtx.orientation}("landscape"). */
  landscape(): void;
  /** Alias for {@link StubCtx.orientation}("portrait"). */
  portrait(): void;
  /**
   * Reset to desktop viewport and clear touch mode. Omit device on a later
   * block = **keep**; only hideDevice / clearDevice / device("desktop") clears.
   */
  hideDevice(): void;
  /** Alias for {@link StubCtx.hideDevice}. */
  clearDevice(): void;
  /** Default camera zoom for rings without their own zoom. */
  zoom(n: number): void;
  /**
   * Default zoomOut for rings in this phase. `false` = keep camera between rings.
   */
  zoomOut(keep: boolean): void;
  /** Top banner title (waygraph demo card). */
  title(text: string): void;
  /** Alias for {@link StubCtx.title}. */
  banner(text: string): void;
  /**
   * Floating checklist dock side (`left` | `right`). Authors control this in
   * code; click / env / --todo-left|right are fallbacks.
   */
  todoPos(side: "left" | "right"): void;
  /** Batch-set rings + episode fixtures. */
  set(partial: { highlights?: HighlightStubPhase } & StubPhaseFixtures): void;
};

export type StubLifecycleFn<Out extends Checkpoint<string>> = (
  ctx: StubCtx<Out>,
) => void | HighlightStubPhase | Promise<void | HighlightStubPhase>;

/**
 * Block stub authoring:
 * - **preferred:** open lifecycle `stubBefore(ctx) { ctx.todos(...); ctx.ring(...) }`
 * - **shorthand:** static slot map `{ email: { selector, label } }`
 * - **legacy:** `(out) => slotMap` still accepted (treated as highlights only)
 */
export type HighlightStubPhaseOrFn<Out extends Checkpoint<string>> =
  | HighlightStubPhase
  | StubLifecycleFn<Out>
  | ((out: Out) => HighlightStubPhase);

/** Result of running a stub phase (rings + episode fixtures). */
export type StubPhaseResult = {
  highlights: ResolvedHighlight[];
  /** Flattened first-group items (compat). Prefer {@link todoDock}. */
  todos: WaygraphTodoItem[];
  todoIndex?: number;
  todoDock?: TodoDockState;
  /**
   * Todo dock intent for this phase:
   * - `set` - replace dock with {@link todoDock}
   * - `clear` - hide dock (author called hideTodos / empty todos())
   * - `keep` - author omitted todos; demo must leave previous dock alone
   */
  todoSync?: "set" | "clear" | "keep";
  /** Resolved device after this phase (undefined when keep with no prior). */
  device?: DeviceState;
  /**
   * Device intent (mirror todoSync):
   * - `set` - apply {@link device}
   * - `clear` - reset to desktop (hideDevice / clearDevice / device desktop)
   * - `keep` - author omitted device; demo must leave previous alone
   */
  deviceSync?: "set" | "clear" | "keep";
  zoom?: number;
  zoomOut?: boolean;
  title?: string;
  todoPos?: "left" | "right";
  /** When true, keep other docks (multi-todo). Default false = replace. */
  todoParallel?: boolean;
};

/**
 * One yap/slide in a multi-step demo caption sequence.
 * Not block lifecycle - demo pauses (Next / auto-next) between slides.
 */
export interface WaygraphSlide extends FixtureDurationFields {
  /** Primary caption (required). */
  caption: string;
  detail?: string;
  tag?: string;
  /** Optional ring while this slide is showing. */
  selector?: string;
  tone?: HighlightTone;
  size?: HighlightSize;
  weight?: HighlightWeight;
  /** Magnify via camera (Screen Studio) while this slide is showing. */
  zoom?: number;
}

/**
 * Demo ring tones (iconified).
 * Automation (`auto`) is gray so authored planned/info/warning/danger/success stand out.
 * `orange` added for Blind Pilot's own real, direct user request: a visible
 * color distinction between a real Playwright-driven action (a Block run,
 * or a raw click/type/upload - `auto` gray, already meant exactly this) and
 * a pure DOM inspection (`auto dom` - orange, new) - "gray is waygraph
 * playwright run. orange is dom check."
 */
export type HighlightTone =
  | "planned"
  | "auto"
  | "info"
  | "warning"
  | "danger"
  | "success"
  | "orange";

/** Ring + label scale. */
export type HighlightSize = "sm" | "md" | "lg";

/** Label font weight. */
export type HighlightWeight = "normal" | "bold";

/** Optional Flow-level defaults for demo rings (episode-wide). Stub/fixture wins. */
export type HighlightStyleDefaults = {
  tone?: HighlightTone;
  size?: HighlightSize;
  weight?: HighlightWeight;
};

/** Apply Flow defaults under per-slot authored values (slot wins when set). */
export function applyHighlightStyleDefaults<
  T extends { tone?: HighlightTone | string; size?: HighlightSize | string; weight?: HighlightWeight | string },
>(slot: T, defaults?: HighlightStyleDefaults | null): T & {
  tone: HighlightTone;
  size: HighlightSize;
  weight: HighlightWeight;
} {
  const tone =
    slot.tone !== undefined && slot.tone !== ""
      ? normalizeHighlightTone(slot.tone)
      : defaults?.tone !== undefined
        ? normalizeHighlightTone(defaults.tone)
        : "planned";
  const size =
    slot.size !== undefined && slot.size !== ""
      ? normalizeHighlightSize(slot.size)
      : defaults?.size !== undefined
        ? normalizeHighlightSize(defaults.size)
        : "md";
  const weight =
    slot.weight !== undefined && slot.weight !== ""
      ? normalizeHighlightWeight(slot.weight)
      : defaults?.weight !== undefined
        ? normalizeHighlightWeight(defaults.weight)
        : "normal";
  return { ...slot, tone, size, weight };
}

const TONE_ICONS: Record<HighlightTone, string> = {
  planned: "",
  auto: "",
  info: "i",
  warning: "!",
  danger: "x",
  success: "+",
  orange: "",
};

/** Map author aliases (`error` -> danger) to a canonical tone. */
export function normalizeHighlightTone(raw: unknown): HighlightTone {
  if (typeof raw !== "string") return "planned";
  const t = raw.trim().toLowerCase();
  if (t === "auto" || t === "automation" || t === "engine") return "auto";
  if (t === "info" || t === "blue") return "info";
  if (t === "warning" || t === "warn" || t === "yellow") return "warning";
  if (t === "danger" || t === "error" || t === "red") return "danger";
  if (t === "success" || t === "ok" || t === "green") return "success";
  if (t === "orange" || t === "amber" || t === "dom" || t === "inspect") return "orange";
  if (t === "planned" || t === "purple" || t === "authored") return "planned";
  return "planned";
}

/** Map size aliases to sm/md/lg. */
export function normalizeHighlightSize(raw: unknown): HighlightSize {
  if (typeof raw !== "string") return "md";
  const t = raw.trim().toLowerCase();
  if (t === "sm" || t === "s" || t === "small" || t === "tiny") return "sm";
  if (t === "lg" || t === "l" || t === "large" || t === "big" || t === "xl") return "lg";
  return "md";
}

/** Map weight aliases to normal/bold. */
export function normalizeHighlightWeight(raw: unknown): HighlightWeight {
  if (typeof raw !== "string") return "normal";
  const t = raw.trim().toLowerCase();
  if (t === "bold" || t === "strong" || t === "heavy" || t === "b") return "bold";
  return "normal";
}

/** Prefix label with a short ASCII icon for semantic tones. */
export function toneIconPrefix(tone: HighlightTone): string {
  const icon = TONE_ICONS[tone];
  return icon ? `[${icon}] ` : "";
}

/**
 * Demo pacing for a Flow episode or a Block/compose group.
 * - `blitz` - FF-like: skip theater + short gates (same as fastForwardComposeBlock)
 * - `fast` - shorter gates, keep cursor theater (~0.33x normal)
 * - `normal` - default demo pace (1x)
 * - `slow` - longer autoplay + fixture dwell (~2x)
 * - `number` - scale vs normal when `<= 20` (e.g. `0.5`, `1.5`, `3`);
 *   absolute gate/dwell ms when `> 20` (e.g. `4500`)
 */
export type DemoPaceName = "blitz" | "fast" | "normal" | "slow";
export type DemoPace = DemoPaceName | number;

/** Default fixture dwell when `duration: true`. */
export const FIXTURE_DURATION_MS_DEFAULT = 2000;
/** Default fixture dwell under `--fast` when duration is enabled. */
export const FIXTURE_DURATION_FAST_MS_DEFAULT = 600;
/** Default fixture dwell under demo pace `slow` (gaps / wrongs review). */
export const FIXTURE_DURATION_SLOW_MS_DEFAULT = 4000;

/** @deprecated Prefer FIXTURE_DURATION_MS_DEFAULT */
export const SLIDE_DURATION_MS_DEFAULT = FIXTURE_DURATION_MS_DEFAULT;
/** @deprecated Prefer FIXTURE_DURATION_FAST_MS_DEFAULT */
export const SLIDE_DURATION_FAST_MS_DEFAULT = FIXTURE_DURATION_FAST_MS_DEFAULT;

export function normalizeDemoPace(raw: unknown): DemoPace {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "blitz" || t === "ff") return "blitz";
    if (t === "fast" || t === "quick") return "fast";
    if (t === "slow" || t === "careful" || t === "review") return "slow";
    if (t === "normal" || t === "default" || t === "1x") return "normal";
    // "2x" / "0.5x"
    if (t.endsWith("x")) {
      const n = Number(t.slice(0, -1));
      if (Number.isFinite(n) && n > 0) return n;
    }
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return "normal";
}

/** Named / numeric pace -> scale vs normal (1 = normal). Absolute ms (>20) maps via default dwell. */
export function demoPaceScale(pace: DemoPace): number {
  if (typeof pace === "number") {
    if (pace > 20) return Math.min(10, Math.max(0.05, pace / FIXTURE_DURATION_MS_DEFAULT));
    return Math.min(10, Math.max(0.05, pace));
  }
  if (pace === "blitz") return 0.05;
  if (pace === "fast") return 0.33;
  if (pace === "slow") return 2;
  return 1;
}

export function demoPaceIsBlitz(pace: DemoPace): boolean {
  return pace === "blitz" || (typeof pace === "number" && pace > 0 && pace <= 0.1);
}

/** True when pace should use the short-gate / fast fixture path (not slow authored). */
export function demoPaceIsFast(pace: DemoPace): boolean {
  if (demoPaceIsBlitz(pace)) return true;
  if (pace === "fast") return true;
  if (typeof pace === "number" && pace <= 20) return pace < 0.75;
  return false;
}

export function demoPaceIsSlow(pace: DemoPace): boolean {
  if (pace === "slow") return true;
  if (typeof pace === "number") {
    if (pace > 20) return pace >= 3000;
    return pace > 1.25;
  }
  return false;
}

/** Autoplay / Next-gate ms for this pace (base is WAYGRAPH_AUTOPLAY_MS or 1800). */
export function demoPaceGateMs(pace: DemoPace, baseAutoplayMs: number): number {
  if (demoPaceIsBlitz(pace)) return Math.min(80, baseAutoplayMs);
  if (typeof pace === "number" && pace > 20) {
    return Math.min(30000, Math.max(80, Math.round(pace)));
  }
  const scale = demoPaceScale(pace);
  return Math.min(30000, Math.max(80, Math.round(baseAutoplayMs * scale)));
}

/**
 * Short chip for the demo panel (e.g. `2.5x`, `4500ms`, `slow`).
 * Always printable - numbers speak in the UI, not only in code.
 */
export function formatDemoPaceBadge(pace: DemoPace, baseAutoplayMs = 1800): string {
  const p = normalizeDemoPace(pace);
  if (typeof p === "number" && p > 20) return `${Math.round(p)}ms`;
  if (typeof p === "number") {
    const s = Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100);
    return `${s}x`;
  }
  if (p === "blitz") return "blitz";
  if (p === "fast") return "fast";
  if (p === "slow") return "slow";
  void baseAutoplayMs;
  return "1x";
}

/**
 * Loud one-line pace description for panel + console
 * (e.g. `pace 2.5x (~4500ms gates)` / `pace 4500ms gates (~2.25x)`).
 */
export function formatDemoPaceLabel(pace: DemoPace, baseAutoplayMs = 1800): string {
  const p = normalizeDemoPace(pace);
  const gate = demoPaceGateMs(p, baseAutoplayMs);
  const scale = demoPaceScale(p);
  const scaleTxt = Number.isInteger(scale) ? String(scale) : (Math.round(scale * 100) / 100).toString();
  if (typeof p === "number" && p > 20) {
    return `pace ${Math.round(p)}ms gates (~${scaleTxt}x)`;
  }
  if (typeof p === "number") {
    const s = Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100);
    return `pace ${s}x (~${gate}ms gates)`;
  }
  if (p === "blitz") return `pace blitz (~${gate}ms, skip theater)`;
  if (p === "fast") return `pace fast (~${scaleTxt}x, ~${gate}ms gates)`;
  if (p === "slow") return `pace slow (~${scaleTxt}x, ~${gate}ms gates)`;
  return `pace normal (1x, ~${gate}ms gates)`;
}

/**
 * Resolve min dwell ms for any fixture (stub / flow fixture / yap slide),
 * or `null` when duration is unset (caller keeps legacy timing).
 *
 * Authoring wins: an explicit slow/numeric pace is not crushed by CLI `--fast`
 * (`gatesFast`). `--fast` only shortens when pace is unset/normal.
 */
export function resolveFixtureDwellMs(
  fixture: FixtureDurationFields,
  opts?: { gatesFast?: boolean; pace?: DemoPace },
): number | null {
  if (fixture.duration === undefined || fixture.duration === false) return null;
  const pace =
    opts?.pace !== undefined && opts.pace !== null
      ? normalizeDemoPace(opts.pace)
      : opts?.gatesFast
        ? "fast"
        : "normal";
  const fastMs =
    typeof fixture.fastMode === "number" && Number.isFinite(fixture.fastMode) && fixture.fastMode >= 0
      ? fixture.fastMode
      : FIXTURE_DURATION_FAST_MS_DEFAULT;
  const normalMs =
    fixture.duration === true
      ? FIXTURE_DURATION_MS_DEFAULT
      : typeof fixture.duration === "number" && Number.isFinite(fixture.duration) && fixture.duration >= 0
        ? fixture.duration
        : FIXTURE_DURATION_MS_DEFAULT;

  if (typeof pace === "number") {
    if (pace > 20) return Math.round(pace);
    return Math.max(0, Math.round(normalMs * Math.min(10, Math.max(0.05, pace))));
  }
  if (pace === "blitz" || pace === "fast") return fastMs;
  // CLI --fast only when author left pace at normal
  if (opts?.gatesFast && pace === "normal") return fastMs;
  if (pace === "slow") return Math.max(normalMs, FIXTURE_DURATION_SLOW_MS_DEFAULT);
  return normalMs;
}

/** @deprecated Prefer {@link resolveFixtureDwellMs} */
export function resolveSlideDwellMs(
  slide: FixtureDurationFields,
  opts?: { gatesFast?: boolean; pace?: DemoPace },
): number | null {
  return resolveFixtureDwellMs(slide, opts);
}

/**
 * Effective demo pace for a step: block override > flow episode > normal.
 * Opaque FF / wasFastForward always win as blitz.
 */
export function resolveStepDemoPace(opts: {
  blockPace?: DemoPace | string | number | null;
  flowPace?: DemoPace | string | number | null;
  fastForward?: boolean;
  wasFastForward?: boolean;
}): DemoPace {
  if (opts.fastForward || opts.wasFastForward) return "blitz";
  if (opts.blockPace != null && opts.blockPace !== "") {
    return normalizeDemoPace(opts.blockPace);
  }
  if (opts.flowPace != null && opts.flowPace !== "") {
    return normalizeDemoPace(opts.flowPace);
  }
  return "normal";
}

export type WaygraphSlidesOrFn<Out extends Checkpoint<string>> =
  | readonly WaygraphSlide[]
  | ((out: Out) => readonly WaygraphSlide[]);

/** Demo stub phase names (block instruction + flow fixtures). */
export type HighlightStubPhaseName = "stubBefore" | "stubAfter" | "stubOnError";

/** Per-block fixture map attached to a Flow via {@link withHighlightFixtures}. */
export type HighlightFixtureMap = Record<
  string,
  {
    stubBefore?: Record<string, WaygraphHighlightFixture>;
    stubAfter?: Record<string, WaygraphHighlightFixture>;
    /** Fail-path rings (demo step throw) - distinct copy from success stubAfter. */
    stubOnError?: Record<string, WaygraphHighlightFixture>;
    /** Override / supply multi-step yap slides for this block (demo only). */
    slides?: readonly WaygraphSlide[];
  }
>;

/** Legacy array highlight (shimmed to stubAfter keys "0", "1", ...). */
export interface WaygraphHighlight {
  selector: string;
  label: string;
  tone?: HighlightTone;
}

export type ResolvedHighlight = WaygraphHighlightStub;

function isStubPhase(v: unknown): v is HighlightStubPhase {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function pickDurationFields(
  base: FixtureDurationFields | undefined,
  patch: FixtureDurationFields | undefined,
): FixtureDurationFields {
  const out: FixtureDurationFields = {};
  const duration = patch?.duration !== undefined ? patch.duration : base?.duration;
  const fastMode = patch?.fastMode !== undefined ? patch.fastMode : base?.fastMode;
  if (duration !== undefined) out.duration = duration;
  if (fastMode !== undefined) out.fastMode = fastMode;
  return out;
}

function pickStyleFields(
  base: Pick<WaygraphHighlightStub, "tone" | "size" | "weight"> | undefined,
  patch: Pick<WaygraphHighlightFixture, "tone" | "size" | "weight"> | undefined,
): Pick<WaygraphHighlightStub, "tone" | "size" | "weight"> {
  const out: Pick<WaygraphHighlightStub, "tone" | "size" | "weight"> = {};
  const tone = patch?.tone !== undefined ? patch.tone : base?.tone;
  const size = patch?.size !== undefined ? patch.size : base?.size;
  const weight = patch?.weight !== undefined ? patch.weight : base?.weight;
  if (tone !== undefined) out.tone = normalizeHighlightTone(tone);
  if (size !== undefined) out.size = normalizeHighlightSize(size);
  if (weight !== undefined) out.weight = normalizeHighlightWeight(weight);
  return out;
}

function pickZoom(
  base: Pick<WaygraphHighlightStub, "zoom"> | undefined,
  patch: Pick<WaygraphHighlightFixture, "zoom"> | undefined,
): Pick<WaygraphHighlightStub, "zoom"> {
  const zoom = patch?.zoom !== undefined ? patch.zoom : base?.zoom;
  if (zoom !== undefined && Number.isFinite(zoom) && zoom > 0) return { zoom };
  return {};
}

function pickFxFields(
  base: Pick<WaygraphHighlightStub, "focus" | "color" | "cursor" | "todo" | "gesture"> | undefined,
  patch: Pick<WaygraphHighlightFixture, "focus" | "color" | "cursor" | "todo" | "gesture"> | undefined,
): Pick<WaygraphHighlightStub, "focus" | "color" | "cursor" | "todo" | "gesture"> {
  const out: Pick<WaygraphHighlightStub, "focus" | "color" | "cursor" | "todo" | "gesture"> = {};
  const focus = patch?.focus !== undefined ? patch.focus : base?.focus;
  const color = patch?.color !== undefined ? patch.color : base?.color;
  const cursor = patch?.cursor !== undefined ? patch.cursor : base?.cursor;
  const todo = patch?.todo !== undefined ? patch.todo : base?.todo;
  const gesture = patch?.gesture !== undefined ? patch.gesture : base?.gesture;
  if (focus !== undefined) out.focus = !!focus;
  if (color !== undefined && String(color).trim()) out.color = String(color).trim();
  if (cursor !== undefined) out.cursor = !!cursor;
  if (todo !== undefined && String(todo).trim()) out.todo = String(todo).trim();
  if (gesture === "tap" || gesture === "hold" || gesture === "click" || gesture === "swipe") {
    out.gesture = gesture;
  }
  return out;
}

function mergeSlot(
  base: WaygraphHighlightStub | undefined,
  patch: WaygraphHighlightFixture | undefined,
): WaygraphHighlightStub | null {
  if (!base && !patch) return null;
  const dwell = pickDurationFields(base, patch);
  const style = pickStyleFields(base, patch);
  const zoom = pickZoom(base, patch);
  const fx = pickFxFields(base, patch);
  if (!base && patch) {
    if (!patch.selector) return null;
    return {
      selector: patch.selector,
      label: patch.label,
      ...(patch.detail ? { detail: patch.detail } : {}),
      ...(patch.tag ? { tag: patch.tag } : {}),
      ...style,
      ...dwell,
      ...zoom,
      ...fx,
    };
  }
  if (base && !patch) {
    return {
      ...base,
      ...(base.tone ? { tone: normalizeHighlightTone(base.tone) } : {}),
      ...(base.size ? { size: normalizeHighlightSize(base.size) } : {}),
      ...(base.weight ? { weight: normalizeHighlightWeight(base.weight) } : {}),
      ...pickZoom(base, undefined),
      ...pickFxFields(base, undefined),
    };
  }
  return {
    selector: patch!.selector ?? base!.selector,
    label: patch!.label,
    ...(patch!.detail !== undefined
      ? { detail: patch!.detail }
      : base!.detail
        ? { detail: base!.detail }
        : {}),
    ...(patch!.tag !== undefined ? { tag: patch!.tag } : base!.tag ? { tag: base!.tag } : {}),
    ...style,
    ...dwell,
    ...zoom,
    ...fx,
  };
}

type StubBagState = {
  highlights: HighlightStubPhase;
  todos?: readonly WaygraphTodoInput[] | undefined;
  todoIndex?: number | undefined;
  todoTitle?: string | undefined;
  todoId?: string | undefined;
  todoStyle?: TodoListStyle | undefined;
  todoGroups?: readonly WaygraphTodoGroupInput[] | undefined;
  /** Author touched the todo dock this phase (set or clear). */
  todoTouched?: boolean | undefined;
  /** Author asked to hide the dock. */
  hideTodos?: boolean | undefined;
  /** Author touched device this phase (set or clear). */
  deviceTouched?: boolean | undefined;
  /** Author asked to reset to desktop. */
  hideDevice?: boolean | undefined;
  device?: DeviceState | undefined;
  /** Touch override when set via ctx.touch() alone or with device. */
  touchOverride?: boolean | undefined;
  /** Orientation override when set via ctx.orientation / landscape / portrait. */
  orientationOverride?: DeviceOrientation | undefined;
  zoom?: number | undefined;
  zoomOut?: boolean | undefined;
  title?: string | undefined;
  todoPos?: "left" | "right" | undefined;
  /** Keep sibling docks (compact todos opts.parallel). */
  todoParallel?: boolean | undefined;
};

/** Normalize checklist dock side. */
export function normalizeTodoPos(raw: unknown): "left" | "right" | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "left" || s === "l") return "left";
  if (s === "right" || s === "r") return "right";
  return undefined;
}

/** Normalize dock list style. */
export function normalizeTodoStyle(raw: unknown): TodoListStyle | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "sequential" || s === "seq" || s === "steps" || s === "step") return "sequential";
  if (s === "checklist" || s === "check" || s === "checks" || s === "box") return "checklist";
  if (
    s === "bullets" ||
    s === "bullet" ||
    s === "list" ||
    s === "ul" ||
    s === "points" ||
    s === "plain"
  ) {
    return "bullets";
  }
  return undefined;
}

/**
 * Normalize checklist rows; apply todoIndex for sequential done/current.
 * In checklist / bullets mode, todoIndex is ignored unless items omit explicit done
 * (bullets never auto-mark current).
 */
export function normalizeTodos(
  todos: readonly WaygraphTodoInput[] | undefined,
  todoIndex?: number,
  style: TodoListStyle = "sequential",
): WaygraphTodoItem[] {
  if (!todos || todos.length === 0) return [];
  const idx =
    todoIndex !== undefined && Number.isFinite(todoIndex) ? Math.floor(todoIndex) : undefined;
  return todos.map((t, i) => {
    const text = typeof t === "string" ? t.trim() : String(t?.text ?? "").trim();
    const item: WaygraphTodoItem = { text: text || `Item ${i + 1}` };
    if (typeof t === "object" && t) {
      if (t.done !== undefined) item.done = !!t.done;
      if (t.current !== undefined) item.current = !!t.current;
      const idRaw = t.id ?? t.name;
      if (idRaw != null && String(idRaw).trim()) item.id = String(idRaw).trim();
    }
    if (style === "checklist") {
      if (item.done === undefined) item.done = false;
      item.current = false;
      return item;
    }
    if (style === "bullets") {
      // Flat list: no walkthrough current; keep explicit done if authored.
      item.current = false;
      return item;
    }
    if (idx !== undefined) {
      if (item.done === undefined) item.done = i < idx;
      if (item.current === undefined) item.current = i === idx;
    }
    return item;
  });
}

/** Build the floating dock from bag / phase fields. */
export function buildTodoDock(opts: {
  todos?: readonly WaygraphTodoInput[] | undefined;
  todoIndex?: number | undefined;
  todoTitle?: string | undefined;
  todoId?: string | undefined;
  todoStyle?: TodoListStyle | undefined;
  todoGroups?: readonly WaygraphTodoGroupInput[] | undefined;
  todoPos?: "left" | "right" | undefined;
}): TodoDockState | undefined {
  const style = normalizeTodoStyle(opts.todoStyle) || "sequential";
  const pos = normalizeTodoPos(opts.todoPos);
  const dockId =
    opts.todoId != null && String(opts.todoId).trim() ? String(opts.todoId).trim() : undefined;
  if (opts.todoGroups && opts.todoGroups.length) {
    const groups: WaygraphTodoGroup[] = opts.todoGroups
      .map((g) => {
        const gs = normalizeTodoStyle(g.style) || style;
        const items = normalizeTodos(g.items, g.todoIndex, gs);
        if (!items.length) return null;
        const group: WaygraphTodoGroup = { style: gs, items };
        if (g.title && String(g.title).trim()) group.title = String(g.title).trim();
        const gid = g.id ?? g.name;
        if (gid != null && String(gid).trim()) group.id = String(gid).trim();
        return group;
      })
      .filter((g): g is WaygraphTodoGroup => !!g);
    if (!groups.length) return undefined;
    const dock: TodoDockState = { style, groups };
    if (pos) dock.pos = pos;
    if (dockId) dock.id = dockId;
    return dock;
  }
  const items = normalizeTodos(opts.todos, opts.todoIndex, style);
  if (!items.length) return undefined;
  const group: WaygraphTodoGroup = { style, items };
  // Title once on the dock - not also on the lone group (avoids duplicate headings).
  const dock: TodoDockState = { style, groups: [group] };
  if (opts.todoTitle && String(opts.todoTitle).trim()) {
    dock.title = String(opts.todoTitle).trim();
  }
  if (pos) dock.pos = pos;
  if (dockId) dock.id = dockId;
  return dock;
}

/**
 * Carry-forward rules for the floating todo dock across demo steps.
 * - clear: author called hideTodos / empty todos()
 * - set: author authored a new dock this phase
 * - keep: author omitted todos — preserve previous dock (do not wipe)
 */
export function applyTodoPhase(
  prev: TodoDockState | undefined,
  phase: {
    todoSync?: "set" | "clear" | "keep";
    todoDock?: TodoDockState;
    todos?: WaygraphTodoItem[];
    todoPos?: "left" | "right";
    todoId?: string;
  },
): { dock: TodoDockState | undefined; sync: "set" | "clear" | "keep" } {
  const sync =
    phase.todoSync ||
    (phase.todoDock ? "set" : phase.todos && phase.todos.length ? "set" : "keep");
  if (sync === "clear") return { dock: undefined, sync: "clear" };
  if (sync === "set") {
    if (phase.todoDock) return { dock: phase.todoDock, sync: "set" };
    if (phase.todos && phase.todos.length) {
      const dock = buildTodoDock({
        todos: phase.todos,
        ...(phase.todoPos ? { todoPos: phase.todoPos } : {}),
        ...(phase.todoId ? { todoId: phase.todoId } : {}),
      });
      return { dock, sync: "set" };
    }
    return { dock: undefined, sync: "clear" };
  }
  return { dock: prev, sync: "keep" };
}

/**
 * Advance every sequential group to `index` (capped). Checklist / bullets unchanged.
 * Used while cycling rings / fill/click stubs so the walkthrough moves.
 */
export function advanceTodoDock(dock: TodoDockState | undefined, index: number): TodoDockState | undefined {
  if (!dock || !dock.groups.length) return dock;
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return {
    ...dock,
    groups: dock.groups.map((g) => {
      if (g.style !== "sequential") return g;
      const capped = Math.min(i, Math.max(0, g.items.length - 1));
      const raw = g.items.map((it) => {
        const row: WaygraphTodoItem = { text: it.text };
        if (it.id) row.id = it.id;
        else if (it.name) row.id = it.name;
        return row;
      });
      return {
        ...g,
        items: normalizeTodos(raw, capped, "sequential"),
      };
    }),
  };
}

/**
 * Mark sequential groups complete (all done, none current) - e.g. end of step.
 * Checklist / bullets groups keep explicit done flags.
 */
export function completeSequentialTodoDock(
  dock: TodoDockState | undefined,
): TodoDockState | undefined {
  if (!dock) return dock;
  return {
    ...dock,
    groups: dock.groups.map((g) => {
      if (g.style !== "sequential") return g;
      return {
        ...g,
        items: g.items.map((it) => {
          const row: WaygraphTodoItem = { text: it.text, done: true, current: false };
          if (it.id) row.id = it.id;
          else if (it.name) row.id = it.name;
          return row;
        }),
      };
    }),
  };
}

function createStubCtx<Out extends Checkpoint<string>>(
  bag: StubBagState,
  opts: { out?: Out; error?: unknown },
): StubCtx<Out> {
  return {
    out: opts.out,
    error: opts.error,
    highlights(slots) {
      bag.highlights = { ...(slots || {}) };
    },
    ring(id, stub) {
      bag.highlights = { ...bag.highlights, [id]: stub };
    },
    todos(a: string | readonly WaygraphTodoInput[], b?: readonly WaygraphTodoInput[] | WaygraphTodosOpts, c?: WaygraphTodosOpts) {
      bag.todoTouched = true;
      bag.hideTodos = false;
      delete bag.todoGroups;
      if (typeof a === "string") {
        const id = String(a).trim();
        if (id) bag.todoId = id;
        else delete bag.todoId;
        const items = (Array.isArray(b) ? b : []) as readonly WaygraphTodoInput[];
        bag.todos = items;
        const opts = (c && typeof c === "object" ? c : {}) as WaygraphTodosOpts;
        if (opts.title != null) bag.todoTitle = String(opts.title);
        if (opts.index != null) bag.todoIndex = Number(opts.index);
        const st = normalizeTodoStyle(opts.style);
        if (st) bag.todoStyle = st;
        const pos = normalizeTodoPos(opts.pos);
        if (pos) bag.todoPos = pos;
        bag.todoParallel = opts.parallel === true;
        if (!items.length) bag.hideTodos = true;
        return;
      }
      bag.todos = a;
      // Legacy list-only form: leave parallel unset (CLI treats as replace).
      delete bag.todoParallel;
      if (!a || !a.length) bag.hideTodos = true;
    },
    todoIndex(n) {
      bag.todoIndex = n;
    },
    todoTitle(text) {
      bag.todoTitle = String(text ?? "");
    },
    todoId(id) {
      bag.todoTouched = true;
      const cleaned = String(id ?? "").trim();
      if (cleaned) bag.todoId = cleaned;
      else delete bag.todoId;
    },
    todoStyle(style) {
      const s = normalizeTodoStyle(style);
      if (s) bag.todoStyle = s;
    },
    todoGroups(groups) {
      bag.todoTouched = true;
      bag.hideTodos = false;
      bag.todoGroups = groups;
      if (!groups || !groups.length) bag.hideTodos = true;
    },
    hideTodos() {
      bag.todoTouched = true;
      bag.hideTodos = true;
      bag.todos = [];
      delete bag.todoGroups;
    },
    clearTodos() {
      bag.todoTouched = true;
      bag.hideTodos = true;
      bag.todos = [];
      delete bag.todoGroups;
    },
    device(preset) {
      bag.deviceTouched = true;
      bag.hideDevice = false;
      const resolved = resolveDeviceState(preset, bag.touchOverride, bag.orientationOverride);
      if (resolved) {
        bag.device = resolved;
        if (resolved.preset === "desktop" && !resolved.touchMode) {
          bag.hideDevice = true;
        }
      }
    },
    viewport(box) {
      bag.deviceTouched = true;
      bag.hideDevice = false;
      const resolved = resolveDeviceState(box, bag.touchOverride, bag.orientationOverride);
      if (resolved) bag.device = resolved;
    },
    touch(on) {
      bag.deviceTouched = true;
      const enabled = on === undefined ? true : !!on;
      bag.touchOverride = enabled;
      if (enabled) bag.hideDevice = false;
      if (bag.device) {
        bag.device = {
          ...bag.device,
          touchMode: enabled,
          hasTouch: bag.device.hasTouch || enabled,
        };
        if (enabled) bag.hideDevice = false;
      } else if (enabled) {
        const base = resolveDeviceState("desktop", true, bag.orientationOverride);
        if (base) bag.device = { ...base, touchMode: true, hasTouch: true };
      }
    },
    orientation(o) {
      const want = normalizeDeviceOrientation(o);
      if (!want) return;
      bag.deviceTouched = true;
      bag.hideDevice = false;
      bag.orientationOverride = want;
      const base =
        bag.device ||
        resolveDeviceState("mobile", bag.touchOverride) ||
        resolveDeviceState("mobile");
      if (base) bag.device = applyOrientation(base, want);
    },
    landscape() {
      this.orientation("landscape");
    },
    portrait() {
      this.orientation("portrait");
    },
    hideDevice() {
      bag.deviceTouched = true;
      bag.hideDevice = true;
      bag.device = resolveDeviceState("desktop", false);
      bag.touchOverride = false;
      bag.orientationOverride = undefined;
    },
    clearDevice() {
      bag.deviceTouched = true;
      bag.hideDevice = true;
      bag.device = resolveDeviceState("desktop", false);
      bag.touchOverride = false;
      bag.orientationOverride = undefined;
    },
    zoom(n) {
      if (Number.isFinite(n) && n > 0) bag.zoom = n;
    },
    zoomOut(keep) {
      bag.zoomOut = !!keep;
    },
    title(text) {
      bag.title = String(text ?? "");
    },
    banner(text) {
      bag.title = String(text ?? "");
    },
    todoPos(side) {
      const p = normalizeTodoPos(side);
      if (p) bag.todoPos = p;
    },
    set(partial) {
      if (partial.highlights) bag.highlights = { ...partial.highlights };
      if (partial.todos !== undefined) {
        bag.todoTouched = true;
        bag.hideTodos = !partial.todos || !partial.todos.length;
        bag.todos = partial.todos;
        if (partial.todoGroups === undefined) delete bag.todoGroups;
      }
      if (partial.todoIndex !== undefined) bag.todoIndex = partial.todoIndex;
      if (partial.todoTitle !== undefined) bag.todoTitle = String(partial.todoTitle ?? "");
      if (partial.todoId !== undefined) {
        bag.todoTouched = true;
        const cleaned = String(partial.todoId ?? "").trim();
        if (cleaned) bag.todoId = cleaned;
        else delete bag.todoId;
      }
      const ts = normalizeTodoStyle(partial.todoStyle);
      if (ts) bag.todoStyle = ts;
      if (partial.todoGroups !== undefined) {
        bag.todoTouched = true;
        bag.hideTodos = !partial.todoGroups || !partial.todoGroups.length;
        bag.todoGroups = partial.todoGroups;
      }
      if (partial.touch !== undefined) {
        bag.deviceTouched = true;
        bag.touchOverride = !!partial.touch;
      }
      if (partial.orientation !== undefined) {
        const want = normalizeDeviceOrientation(partial.orientation);
        if (want) {
          bag.deviceTouched = true;
          bag.hideDevice = false;
          bag.orientationOverride = want;
          const base =
            bag.device ||
            resolveDeviceState("mobile", bag.touchOverride) ||
            resolveDeviceState("mobile");
          if (base) bag.device = applyOrientation(base, want);
        }
      }
      if (partial.device !== undefined) {
        bag.deviceTouched = true;
        bag.hideDevice = false;
        const resolved = resolveDeviceState(
          partial.device,
          bag.touchOverride,
          bag.orientationOverride,
        );
        if (resolved) {
          bag.device = resolved;
          if (resolved.preset === "desktop" && !resolved.touchMode) bag.hideDevice = true;
        }
      }
      if (partial.viewport !== undefined) {
        bag.deviceTouched = true;
        bag.hideDevice = false;
        const resolved = resolveDeviceState(
          partial.viewport,
          bag.touchOverride,
          bag.orientationOverride,
        );
        if (resolved) bag.device = resolved;
      }
      if (partial.zoom !== undefined && Number.isFinite(partial.zoom) && partial.zoom > 0) {
        bag.zoom = partial.zoom;
      }
      if (partial.zoomOut !== undefined) bag.zoomOut = !!partial.zoomOut;
      if (partial.title !== undefined) bag.title = String(partial.title ?? "");
      const tp = normalizeTodoPos(partial.todoPos);
      if (tp) bag.todoPos = tp;
    },
  };
}

/** Lift legacy per-slot todos (0.12.23) onto the phase bag once. */
function liftLegacySlotTodos(bag: StubBagState): void {
  if (bag.todos && bag.todos.length) return;
  for (const stub of Object.values(bag.highlights)) {
    const legacy = stub as WaygraphHighlightStub & {
      todos?: readonly WaygraphTodoInput[];
      todoIndex?: number;
    };
    if (legacy.todos && legacy.todos.length) {
      bag.todos = legacy.todos;
      if (legacy.todoIndex !== undefined) bag.todoIndex = legacy.todoIndex;
      return;
    }
  }
}

function applyDefaultZoom(slots: ResolvedHighlight[], defaultZoom?: number): ResolvedHighlight[] {
  if (defaultZoom === undefined || !(defaultZoom > 0)) return slots;
  return slots.map((h) => (h.zoom !== undefined && h.zoom > 0 ? h : { ...h, zoom: defaultZoom }));
}

function applyDefaultZoomOut(
  slots: ResolvedHighlight[],
  defaultZoomOut?: boolean,
): ResolvedHighlight[] {
  if (defaultZoomOut === undefined) return slots;
  return slots.map((h) =>
    h.zoomOut !== undefined ? h : { ...h, zoomOut: defaultZoomOut },
  );
}

function mergePhaseMaps(
  phaseMap: HighlightStubPhase,
  fixturePhase: Record<string, WaygraphHighlightFixture> | undefined,
): ResolvedHighlight[] {
  const phaseKeys = Object.keys(phaseMap);
  const fixtureKeys = Object.keys(fixturePhase || {});
  const allKeys = [...new Set([...phaseKeys, ...fixtureKeys])];
  const allNumeric =
    allKeys.length > 0 && allKeys.every((k) => Number.isFinite(Number(k)) && String(Number(k)) === k);
  // Numeric stub ids (legacy "0","1") sort by number. Named stubs keep author
  // insertion order - localeCompare used to reorder password/submit/username
  // and advance the wrong todo index on fill.
  const ordered = allNumeric
    ? [...allKeys].sort((a, b) => Number(a) - Number(b))
    : [...phaseKeys, ...fixtureKeys.filter((k) => !phaseKeys.includes(k))];
  const resolved: ResolvedHighlight[] = [];
  for (const id of ordered) {
    const merged = mergeSlot(phaseMap[id], fixturePhase?.[id]);
    if (merged) {
      resolved.push({
        ...merged,
        slotId: id,
        ...(merged.todo ? { todo: merged.todo } : {}),
      });
    }
  }
  return resolved;
}

function phaseFromLegacyHighlights(
  highlights: readonly WaygraphHighlight[] | undefined,
): HighlightStubPhase {
  const out: HighlightStubPhase = {};
  if (!highlights) return out;
  highlights.forEach((h, i) => {
    if (h && typeof h.selector === "string" && typeof h.label === "string") {
      out[String(i)] = {
        selector: h.selector,
        label: h.label,
        ...(h.tone ? { tone: normalizeHighlightTone(h.tone) } : {}),
      };
    }
  });
  return out;
}

function readStubRaw(
  block: Block<any, any>,
  phase: HighlightStubPhaseName,
): HighlightStubPhaseOrFn<any> | undefined {
  const instr = block.instruction as {
    stubBefore?: HighlightStubPhaseOrFn<any>;
    stubAfter?: HighlightStubPhaseOrFn<any>;
    stubOnError?: HighlightStubPhaseOrFn<any>;
  };
  if (phase === "stubBefore") return instr.stubBefore;
  if (phase === "stubAfter") return instr.stubAfter;
  return instr.stubOnError;
}

function applyLegacyHighlightsShim(
  block: Block<any, any>,
  phase: HighlightStubPhaseName,
  phaseMap: HighlightStubPhase,
  out?: Checkpoint<string>,
): HighlightStubPhase {
  if (phase !== "stubAfter" || Object.keys(phaseMap).length > 0) return phaseMap;
  const instr = block.instruction as {
    highlights?: readonly WaygraphHighlight[] | ((o: any) => readonly WaygraphHighlight[]);
  };
  if (!instr.highlights) return phaseMap;
  let legacy = instr.highlights;
  if (typeof legacy === "function") {
    try {
      legacy = legacy(out ?? { __state: "" });
    } catch {
      legacy = [];
    }
  }
  return phaseFromLegacyHighlights(Array.isArray(legacy) ? legacy : []);
}

/**
 * Run an open stub lifecycle (preferred) or resolve a static slot map.
 * Returns rings + episode fixtures (todos / todoIndex / zoom).
 *
 * @example
 * const before = await runStubPhase(block, "stubBefore", { fixtures });
 * // before.todos, before.highlights
 */
export async function runStubPhase(
  block: Block<any, any>,
  phase: HighlightStubPhaseName,
  opts?: {
    out?: Checkpoint<string>;
    error?: unknown;
    fixtures?: HighlightFixtureMap;
  },
): Promise<StubPhaseResult> {
  const bag: StubBagState = { highlights: {} };
  const ctx = createStubCtx(bag, {
    ...(opts?.out !== undefined ? { out: opts.out } : {}),
    ...(opts?.error !== undefined ? { error: opts.error } : {}),
  });
  const raw = readStubRaw(block, phase);

  if (typeof raw === "function") {
    try {
      const ret = await (raw as StubLifecycleFn<any>)(ctx as StubCtx<any>);
      if (isStubPhase(ret)) {
        bag.highlights = { ...bag.highlights, ...ret };
      }
    } catch {
      /* best-effort */
    }
    // Compat: legacy `(out) => map` that expected Checkpoint (__state on arg)
    if (Object.keys(bag.highlights).length === 0 && !bag.todos) {
      try {
        const legacyOut = (opts?.out ?? { __state: "" }) as Checkpoint<string>;
        const ret2 = (raw as (o: Checkpoint<string>) => HighlightStubPhase)(legacyOut);
        if (isStubPhase(ret2)) bag.highlights = { ...ret2 };
      } catch {
        /* ignore */
      }
    }
  } else if (isStubPhase(raw)) {
    bag.highlights = { ...raw };
  }

  bag.highlights = applyLegacyHighlightsShim(block, phase, bag.highlights, opts?.out);
  liftLegacySlotTodos(bag);

  const fixturePhase = opts?.fixtures?.[block.name]?.[phase];
  let highlights = mergePhaseMaps(bag.highlights, fixturePhase);
  highlights = applyDefaultZoom(highlights, bag.zoom);
  highlights = applyDefaultZoomOut(highlights, bag.zoomOut);

  const todoDock = bag.hideTodos
    ? undefined
    : buildTodoDock({
        todos: bag.todos,
        todoIndex: bag.todoIndex,
        todoTitle: bag.todoTitle,
        todoId: bag.todoId,
        todoStyle: bag.todoStyle,
        todoGroups: bag.todoGroups,
        todoPos: bag.todoPos,
      });
  const todos =
    todoDock?.groups[0]?.items ||
    (bag.hideTodos
      ? []
      : normalizeTodos(
          bag.todos,
          bag.todoIndex,
          normalizeTodoStyle(bag.todoStyle) || "sequential",
        ));
  // Omit todos entirely => keep previous dock. Explicit empty / hideTodos => clear.
  const todoSync: "set" | "clear" | "keep" = bag.hideTodos
    ? "clear"
    : bag.todoTouched && todoDock
      ? "set"
      : bag.todoTouched && !todoDock
        ? "clear"
        : "keep";

  let deviceState: DeviceState | undefined;
  if (bag.hideDevice) {
    deviceState = resolveDeviceState("desktop", false);
  } else if (bag.device) {
    deviceState = bag.touchOverride !== undefined
      ? {
          ...bag.device,
          touchMode: bag.touchOverride,
          hasTouch: bag.device.hasTouch || bag.touchOverride,
        }
      : bag.device;
  } else if (bag.touchOverride !== undefined) {
    deviceState = resolveDeviceState("desktop", bag.touchOverride);
  }
  const deviceSync: "set" | "clear" | "keep" = bag.hideDevice
    ? "clear"
    : bag.deviceTouched && deviceState
      ? "set"
      : bag.deviceTouched && !deviceState
        ? "clear"
        : "keep";

  return {
    highlights,
    todos,
    todoSync,
    deviceSync,
    ...(bag.todoIndex !== undefined ? { todoIndex: bag.todoIndex } : {}),
    ...(todoDock ? { todoDock } : {}),
    ...(deviceState ? { device: deviceState } : {}),
    ...(bag.zoom !== undefined ? { zoom: bag.zoom } : {}),
    ...(bag.zoomOut !== undefined ? { zoomOut: bag.zoomOut } : {}),
    ...(bag.title !== undefined && bag.title !== "" ? { title: bag.title } : {}),
    ...(bag.todoPos !== undefined ? { todoPos: bag.todoPos } : {}),
    ...(bag.todoParallel === true ? { todoParallel: true } : {}),
  };
}

/**
 * Sync resolve of highlight slots. Prefer {@link runStubPhase} for open
 * async lifecycles + episode fixtures (todos/zoom).
 */
export function resolveHighlightSlots(
  block: Block<any, any>,
  phase: HighlightStubPhaseName,
  opts?: {
    out?: Checkpoint<string>;
    fixtures?: HighlightFixtureMap;
  },
): ResolvedHighlight[] {
  const bag: StubBagState = { highlights: {} };
  const raw = readStubRaw(block, phase);
  if (typeof raw === "function") {
    try {
      const ctx = createStubCtx(bag, {
        ...(opts?.out !== undefined ? { out: opts.out } : {}),
      });
      const ret = (raw as StubLifecycleFn<any>)(ctx as StubCtx<any>);
      if (isStubPhase(ret)) {
        bag.highlights = { ...bag.highlights, ...ret };
      }
    } catch {
      try {
        const legacyOut = (opts?.out ?? { __state: "" }) as Checkpoint<string>;
        const ret2 = (raw as (o: Checkpoint<string>) => HighlightStubPhase)(legacyOut);
        if (isStubPhase(ret2)) bag.highlights = { ...ret2 };
      } catch {
        bag.highlights = {};
      }
    }
  } else if (isStubPhase(raw)) {
    bag.highlights = { ...raw };
  }
  bag.highlights = applyLegacyHighlightsShim(block, phase, bag.highlights, opts?.out);
  liftLegacySlotTodos(bag);
  const fixturePhase = opts?.fixtures?.[block.name]?.[phase];
  return applyDefaultZoom(mergePhaseMaps(bag.highlights, fixturePhase), bag.zoom);
}

/**
 * Resolve multi-step yap slides: flow fixture `slides` wins when present,
 * else `instruction.slides` (function form allowed).
 */
export function resolveSlides(
  block: Block<any, any>,
  opts?: {
    out?: Checkpoint<string>;
    fixtures?: HighlightFixtureMap;
  },
): WaygraphSlide[] {
  const fromFixture = opts?.fixtures?.[block.name]?.slides;
  if (fromFixture && fromFixture.length > 0) {
    return [...fromFixture];
  }
  const instr = block.instruction as { slides?: WaygraphSlidesOrFn<any> };
  let raw = instr.slides;
  if (typeof raw === "function") {
    try {
      raw = raw(opts?.out ?? { __state: "" });
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s.caption === "string" && s.caption.length > 0);
}

/** Caption for ring / slide UI (label|caption + optional detail/tag + tone icon). */
export function formatHighlightCaption(
  h: { label?: string; caption?: string; detail?: string; tag?: string; tone?: HighlightTone | string },
): string {
  const tone = normalizeHighlightTone(h.tone);
  const icon = toneIconPrefix(tone);
  const primary = (h.label ?? h.caption ?? "").trim();
  const tag = h.tag ? `[${h.tag}] ` : "";
  if (h.detail) return `${icon}${tag}${primary} - ${h.detail}`;
  return `${icon}${tag}${primary}`;
}

function stubPhaseLooksAuthored(
  block: Block<any, any>,
  phase: HighlightStubPhaseName,
  fixtures?: HighlightFixtureMap,
): boolean {
  const raw = readStubRaw(block, phase);
  if (typeof raw === "function") return true;
  if (isStubPhase(raw) && Object.keys(raw).length > 0) return true;
  const fx = fixtures?.[block.name]?.[phase];
  if (fx && Object.keys(fx).length > 0) return true;
  return false;
}

/**
 * True when the block authored stubAfter (lifecycle fn, slots, fixtures, or legacy highlights).
 * When true, demo should not use verify-trait fallback.
 */
export function hasAuthoredStubAfter(
  block: Block<any, any>,
  out?: Checkpoint<string>,
  fixtures?: HighlightFixtureMap,
): boolean {
  if (stubPhaseLooksAuthored(block, "stubAfter", fixtures)) return true;
  const instr = block.instruction as { highlights?: unknown };
  if (instr.highlights) return true;
  return resolveHighlightSlots(block, "stubAfter", {
    ...(out !== undefined ? { out } : {}),
    ...(fixtures !== undefined ? { fixtures } : {}),
  }).length > 0;
}

/**
 * True when stubOnError is authored (lifecycle fn and/or rings).
 * Demo fail path only - success never consults this.
 */
export function hasAuthoredStubOnError(
  block: Block<any, any>,
  fixtures?: HighlightFixtureMap,
): boolean {
  if (stubPhaseLooksAuthored(block, "stubOnError", fixtures)) return true;
  return (
    resolveHighlightSlots(block, "stubOnError", {
      ...(fixtures !== undefined ? { fixtures } : {}),
    }).length > 0
  );
}
