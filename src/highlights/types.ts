// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { Checkpoint } from "../types.js";
import type { MemPage } from "../mem-page.js";

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


/**
 * Floating todo-dock UX knobs (0.15.8+). Defaults are **smart on** so long
 * FR/AC checklists do not bury highlight rings. Opt out per phase or globally.
 *
 * Defaults: `compact`, `collision`, `behindRing` = true; `cap` = 5; `expandCap` = 14.
 *
 * Global: `WAYGRAPH_TODO_UI=full` / `waygraph demo --todo-full` turns smart off.
 * Per-knob env: `WAYGRAPH_TODO_COMPACT=0`, `WAYGRAPH_TODO_COLLISION=0`,
 * `WAYGRAPH_TODO_BEHIND=0`, `WAYGRAPH_TODO_CAP`, `WAYGRAPH_TODO_EXPAND_CAP`.
 */
export type TodoDockUiOpts = {
  /** Fold long lists around the current row (+N more / hover). Default true. */
  compact?: boolean;
  /** Visible rows when compact. Default 5. */
  cap?: number;
  /** Visible rows on hover / pinned expand. Default 14. */
  expandCap?: number;
  /** Flip dock L/R when an active ring overlaps it. Default true. */
  collision?: boolean;
  /** Dim + lower z-index while a highlight ring is up. Default true. */
  behindRing?: boolean;
};


/** Resolved todo-dock UX (all fields present). */
export type TodoDockUiResolved = {
  compact: boolean;
  cap: number;
  expandCap: number;
  collision: boolean;
  behindRing: boolean;
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
   * Todo-dock UX (compact / collision / behind-ring). Merged onto env defaults.
   * See {@link TodoDockUiOpts}.
   */
  todoDockUi?: TodoDockUiOpts;
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
  /**
   * Live Mem for this run - same store `act`/`observe` read. Prefer this over
   * closing over outer scope or inventing parallel fixture bags.
   * Undefined only if the caller ran a stub phase without passing mem (tests).
   */
  readonly mem: MemPage | undefined;
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
  /**
   * Todo-dock UX: compact fold, collision flip, dim-behind-ring.
   * Defaults are smart-on; pass false fields to opt out for this phase.
   * @example
   * ctx.todoDockUi({ compact: false }); // always show full list
   * ctx.todoDockFull(); // shorthand: compact+collision+behindRing off
   */
  todoDockUi(opts: TodoDockUiOpts): void;
  /** Shorthand: full checklist, no compact/collision/behind-ring for this phase. */
  todoDockFull(): void;
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
  /** Todo-dock UX for this phase (when author called {@link StubCtx.todoDockUi}). */
  todoDockUi?: TodoDockUiOpts;
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


export type StubBagState = {
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
  /** Author patched todo-dock UX this phase. */
  todoDockUi?: TodoDockUiOpts | undefined;
  /** Keep sibling docks (compact todos opts.parallel). */
  todoParallel?: boolean | undefined;
};
