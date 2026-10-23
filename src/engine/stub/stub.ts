// The ctx stub API: what a stub (stubBefore / stubAfter / stubOnError, chained on a Block in a flow) is given and
// what it records. The demo plays the record (demo/narration/narration.ts); ring.ts, todos.ts, viewport.ts and pace.ts
// are the parts it paints.
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemPage } from "../mem/mem.js";
import type { TodoDockState, TodoDockUiOpts, TodoListStyle, WaygraphTodoGroupInput, WaygraphTodoInput, WaygraphTodoItem, WaygraphTodosOpts } from "./todos.js";
import type { DeviceOrientation, DevicePreset, DeviceState, DeviceViewport } from "./viewport.js";
import type { HighlightStubPhase, ResolvedHighlight, WaygraphHighlightStub } from "./ring.js";

/** Where the top banner sits. */
export type BannerPos = "left" | "center" | "right";

/** Banner UX, mirrors {@link TodoDockUiOpts}: pass `false` fields to opt out for this phase. */
export interface BannerUiOpts {
  /** Move to a free spot while a highlight ring would overlap it (default true). */
  collision?: boolean;
  /** Hide the banner entirely for this phase. */
  hidden?: boolean;
  /**
   * Fade duration (ms) when the banner's title text changes, so a change reads as a deliberate
   * beat instead of an instant flicker. Default 220; 0 disables the fade (instant swap).
   */
  captionFadeMs?: number;
}

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
  /** Banner side/position (`left` | `center` | `right`). Authored control, like the todo dock's `pos`. */
  titlePos?: BannerPos;
  /** Banner UX: collision (move away from a ring it overlaps), hidden. See {@link BannerUiOpts}. */
  bannerUi?: BannerUiOpts;
  /**
   * Bottom narration caption - a white rounded card (black text, shadow), bottom-centered above
   * the step pill, distinct from the banner (top, card-shaped). Omit/clear to hide it; set again
   * to change the text, fading out/in.
   */
  caption?: string;
  /**
   * Network-tab overlay visibility - capture always happens in the background regardless; this
   * only controls whether the panel itself is shown. Intentionally hidden by default (`undefined`
   * on the very first phase); omit to leave whatever the previous step set alone.
   */
  networkTabVisible?: boolean;
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

/**
 * What a stub is given: chained where a flow uses a Block, it paints rings, todos, the device and the banner.
 *
 * @example
 * LoginBlock.stubBefore((ctx) => {
 *   ctx.todos("sign-in", ["Enter email", "Enter password", "Click Sign in"], { index: 0 });
 *   ctx.zoom(1.35);
 *   ctx.highlights({
 *     email: { selector: "#email", label: "Email" },
 *     submit: { selector: "#login-button", label: "Sign in" },
 *   });
 * })
 * // Sequential plan: bump todoIndex in a later phase / a later Block's stubBefore
 * .stubAfter((ctx) => {
 *   ctx.todoIndex(2);
 *   ctx.ring("inventory", { selector: ".inventory_list", label: "Landed" });
 * });
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
   * Floating checklist: `ctx.todos("login", ["Enter email", "Enter password"], { title: "Sign in", index: 0 })`.
   * The id is the dock's `data-wg-todo-id` (stable through redirects). One dock at a time (setting todos replaces it);
   * pass `{ parallel: true }` to keep docks with other ids. An empty list hides the dock.
   */
  todos(id: string, items: readonly WaygraphTodoInput[], opts?: WaygraphTodosOpts): void;
  /** Moves the current dock's current item (sequential plans: a later step bumps it). */
  todoIndex(n: number): void;
  /** Several titled lists in one dock (e.g. Functional Requirements / Scenarios / ACs), with the same id and options as {@link StubCtx.todos}. */
  todoGroups(id: string, groups: readonly WaygraphTodoGroupInput[], opts?: Omit<WaygraphTodosOpts, "index">): void;
  /**
   * Hide the floating todo dock. Omit todos on a later block = **keep** the
   * previous dock (carry forward). Only hideTodos or an empty todos list clears it.
   */
  hideTodos(): void;
  /**
   * Viewport / device fixture (0.13+). `mobile` | `tablet` | `desktop`.
   * Omit on later blocks = **keep** (same persist as todos). Use
   * {@link StubCtx.hideDevice} or `device("desktop")` to return to desktop.
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
  /**
   * Reset to desktop viewport and clear touch mode. Omit device on a later
   * block = **keep**; only hideDevice / device("desktop") clears.
   */
  hideDevice(): void;
  /** Default camera zoom for rings without their own zoom. */
  zoom(n: number): void;
  /**
   * Default zoomOut for rings in this phase. `false` = keep camera between rings.
   */
  zoomOut(keep: boolean): void;
  /** Top banner title (waygraph demo card). `opts.pos` also places it (left | center | right). */
  title(text: string, opts?: { pos?: BannerPos }): void;
  /** Place the banner: `left` | `center` | `right` (authored; click / env are fallbacks). */
  titlePos(side: BannerPos): void;
  /**
   * Banner UX: `{ collision: false }` keeps it put even over a ring; `{ hidden: true }` hides it.
   * @example ctx.bannerUi({ collision: false });
   */
  bannerUi(opts: BannerUiOpts): void;
  /**
   * Bottom narration caption - a white rounded card (black text, shadow), bottom-centered above
   * the step pill; distinct from {@link StubCtx.title}, which is the top banner card. Fades in/out
   * on change. Pass `""` (or call {@link StubCtx.hideCaption}) to clear.
   * @example ctx.caption("Click Add to cart to continue");
   */
  caption(text: string): void;
  /** Clears the caption (fades it out). */
  hideCaption(): void;
  /** Shorthand for `bannerUi({ hidden: true })`. */
  hideBanner(): void;
  /**
   * Shows the network-tab overlay (Postman-style inspector of real page traffic + defineApiBlock
   * calls) - capture always runs in the background; this just reveals the panel. Hidden by default.
   * @example ctx.showNetworkTab();
   */
  showNetworkTab(): void;
  /** Hides the network-tab overlay (capture keeps running - only the panel disappears). */
  hideNetworkTab(): void;
  /**
   * Todo-dock UX: compact fold, collision flip, dim-behind-ring.
   * Defaults are smart-on; pass false fields to opt out for this phase.
   * @example
   * ctx.todoDockUi({ compact: false }); // always show the full list
   */
  todoDockUi(opts: TodoDockUiOpts): void;
};

/** A stub callback: receives the stub `ctx` and paints rings, titles and todos. */
export type StubLifecycleFn<Out extends Checkpoint<string>> = (
  ctx: StubCtx<Out>,
) => void | Promise<void>;


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
   * - `clear` - reset to desktop (hideDevice / device desktop)
   * - `keep` - author omitted device; demo must leave previous alone
   */
  deviceSync?: "set" | "clear" | "keep";
  zoom?: number;
  zoomOut?: boolean;
  title?: string;
  titlePos?: BannerPos;
  bannerUi?: BannerUiOpts;
  caption?: string;
  networkTabVisible?: boolean;
  todoPos?: "left" | "right";
  /** When true, keep other docks (multi-todo). Default false = replace. */
  todoParallel?: boolean;
};

/** Demo stub phase names. */
export type HighlightStubPhaseName = "stubBefore" | "stubAfter" | "stubOnError";

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
  titlePos?: BannerPos | undefined;
  bannerUi?: BannerUiOpts | undefined;
  caption?: string | undefined;
  networkTabVisible?: boolean | undefined;
  todoPos?: "left" | "right" | undefined;
  /** Author patched todo-dock UX this phase. */
  todoDockUi?: TodoDockUiOpts | undefined;
  /** Keep sibling docks (compact todos opts.parallel). */
  todoParallel?: boolean | undefined;
};