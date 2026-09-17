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
  /** Explicit done. If omitted, derived from todoIndex (index < todoIndex). */
  done?: boolean;
  /** Explicit current. If omitted, derived from todoIndex (index === todoIndex). */
  current?: boolean;
};

export type WaygraphTodoInput = string | WaygraphTodoItem;

/** Episode-level fixtures authored inside stubBefore/After/OnError(ctx). */
export type StubPhaseFixtures = {
  todos?: readonly WaygraphTodoInput[];
  /** Which todo is current (0-based). Rows before = done, after = pending. */
  todoIndex?: number;
  /** Default zoom for rings that omit their own zoom. */
  zoom?: number;
};

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
   * Magnify this target while its ring is shown (e.g. `1.35`).
   * Cleared when the ring hides / next highlight starts. `1` or omit = off.
   * Episode default: {@link StubCtx.zoom}.
   */
  zoom?: number;
}

/** Flow fixture patch: label required; selector optional (inherits from stub). */
export type WaygraphHighlightFixture = Partial<Pick<WaygraphHighlightStub, "selector">> &
  Required<Pick<WaygraphHighlightStub, "label">> &
  Pick<WaygraphHighlightStub, "detail" | "tag" | "tone" | "size" | "weight" | "zoom"> &
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
  /** Episode checklist (demo panel). */
  todos(items: readonly WaygraphTodoInput[]): void;
  /** Current checklist index (bump for sequential plans). */
  todoIndex(n: number): void;
  /** Default zoom for rings without their own zoom. */
  zoom(n: number): void;
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
  todos: WaygraphTodoItem[];
  todoIndex?: number;
  zoom?: number;
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
  /** Magnify selector target while this slide is showing (same as stub zoom). */
  zoom?: number;
}

/**
 * Demo ring tones (iconified).
 * Automation (`auto`) is gray so authored planned/info/warning/danger/success stand out.
 */
export type HighlightTone =
  | "planned"
  | "auto"
  | "info"
  | "warning"
  | "danger"
  | "success";

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

/**
 * Normalize checklist rows; apply todoIndex for sequential done/current.
 */
export function normalizeTodos(
  todos: readonly WaygraphTodoInput[] | undefined,
  todoIndex?: number,
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
    }
    if (idx !== undefined) {
      if (item.done === undefined) item.done = i < idx;
      if (item.current === undefined) item.current = i === idx;
    }
    return item;
  });
}

function pickZoom(
  base: Pick<WaygraphHighlightStub, "zoom"> | undefined,
  patch: Pick<WaygraphHighlightFixture, "zoom"> | undefined,
): Pick<WaygraphHighlightStub, "zoom"> {
  const zoom = patch?.zoom !== undefined ? patch.zoom : base?.zoom;
  if (zoom !== undefined && Number.isFinite(zoom) && zoom > 0) return { zoom };
  return {};
}

function mergeSlot(
  base: WaygraphHighlightStub | undefined,
  patch: WaygraphHighlightFixture | undefined,
): WaygraphHighlightStub | null {
  if (!base && !patch) return null;
  const dwell = pickDurationFields(base, patch);
  const style = pickStyleFields(base, patch);
  const zoom = pickZoom(base, patch);
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
    };
  }
  if (base && !patch) {
    return {
      ...base,
      ...(base.tone ? { tone: normalizeHighlightTone(base.tone) } : {}),
      ...(base.size ? { size: normalizeHighlightSize(base.size) } : {}),
      ...(base.weight ? { weight: normalizeHighlightWeight(base.weight) } : {}),
      ...pickZoom(base, undefined),
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
  };
}

type StubBagState = {
  highlights: HighlightStubPhase;
  todos?: readonly WaygraphTodoInput[];
  todoIndex?: number;
  zoom?: number;
};

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
    todos(items) {
      bag.todos = items;
    },
    todoIndex(n) {
      bag.todoIndex = n;
    },
    zoom(n) {
      if (Number.isFinite(n) && n > 0) bag.zoom = n;
    },
    set(partial) {
      if (partial.highlights) bag.highlights = { ...partial.highlights };
      if (partial.todos !== undefined) bag.todos = partial.todos;
      if (partial.todoIndex !== undefined) bag.todoIndex = partial.todoIndex;
      if (partial.zoom !== undefined && Number.isFinite(partial.zoom) && partial.zoom > 0) {
        bag.zoom = partial.zoom;
      }
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

function mergePhaseMaps(
  phaseMap: HighlightStubPhase,
  fixturePhase: Record<string, WaygraphHighlightFixture> | undefined,
): ResolvedHighlight[] {
  const slotIds = new Set([...Object.keys(phaseMap), ...Object.keys(fixturePhase || {})]);
  const ordered = [...slotIds].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  const resolved: ResolvedHighlight[] = [];
  for (const id of ordered) {
    const merged = mergeSlot(phaseMap[id], fixturePhase?.[id]);
    if (merged) resolved.push(merged);
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

  const todos = normalizeTodos(bag.todos, bag.todoIndex);
  return {
    highlights,
    todos,
    ...(bag.todoIndex !== undefined ? { todoIndex: bag.todoIndex } : {}),
    ...(bag.zoom !== undefined ? { zoom: bag.zoom } : {}),
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
