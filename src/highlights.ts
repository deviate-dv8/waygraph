/**
 * Block stubBefore / stubAfter / stubOnError + flow highlightFixtures + demo slides.
 * Demo narration only - never affects runGraph pass/fail.
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
}

/** Flow fixture patch: label required; selector optional (inherits from stub). */
export type WaygraphHighlightFixture = Partial<Pick<WaygraphHighlightStub, "selector">> &
  Required<Pick<WaygraphHighlightStub, "label">> &
  Pick<WaygraphHighlightStub, "detail" | "tag" | "tone"> &
  FixtureDurationFields;

export type HighlightStubPhase = Record<string, WaygraphHighlightStub>;

export type HighlightStubPhaseOrFn<Out extends Checkpoint<string>> =
  | HighlightStubPhase
  | ((out: Out) => HighlightStubPhase);

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

/** Prefix label with a short ASCII icon for semantic tones. */
export function toneIconPrefix(tone: HighlightTone): string {
  const icon = TONE_ICONS[tone];
  return icon ? `[${icon}] ` : "";
}

/**
 * Demo pacing for a Flow episode or a Block/compose group.
 * - `blitz` - FF-like: skip theater + short gates (same as fastForwardComposeBlock)
 * - `fast` - shorter gates, keep cursor theater
 * - `normal` - default demo pace
 * - `slow` - longer autoplay + fixture dwell (gaps / wrongs review)
 */
export type DemoPace = "blitz" | "fast" | "normal" | "slow";

export function normalizeDemoPace(raw: unknown): DemoPace {
  if (typeof raw !== "string") return "normal";
  const t = raw.trim().toLowerCase();
  if (t === "blitz" || t === "ff") return "blitz";
  if (t === "fast" || t === "quick") return "fast";
  if (t === "slow" || t === "careful" || t === "review") return "slow";
  return "normal";
}

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

/**
 * Resolve min dwell ms for any fixture (stub / flow fixture / yap slide),
 * or `null` when duration is unset (caller keeps legacy timing).
 */
export function resolveFixtureDwellMs(
  fixture: FixtureDurationFields,
  opts?: { gatesFast?: boolean; pace?: DemoPace },
): number | null {
  if (fixture.duration === undefined || fixture.duration === false) return null;
  const pace = normalizeDemoPace(opts?.pace ?? (opts?.gatesFast ? "fast" : "normal"));
  const fastMs =
    typeof fixture.fastMode === "number" && Number.isFinite(fixture.fastMode) && fixture.fastMode >= 0
      ? fixture.fastMode
      : FIXTURE_DURATION_FAST_MS_DEFAULT;
  if (pace === "blitz" || pace === "fast" || opts?.gatesFast) return fastMs;
  const normalMs =
    fixture.duration === true
      ? FIXTURE_DURATION_MS_DEFAULT
      : typeof fixture.duration === "number" && Number.isFinite(fixture.duration) && fixture.duration >= 0
        ? fixture.duration
        : FIXTURE_DURATION_MS_DEFAULT;
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
  blockPace?: DemoPace | string | null;
  flowPace?: DemoPace | string | null;
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

function mergeSlot(
  base: WaygraphHighlightStub | undefined,
  patch: WaygraphHighlightFixture | undefined,
): WaygraphHighlightStub | null {
  if (!base && !patch) return null;
  const dwell = pickDurationFields(base, patch);
  if (!base && patch) {
    if (!patch.selector) return null;
    return {
      selector: patch.selector,
      label: patch.label,
      ...(patch.detail ? { detail: patch.detail } : {}),
      ...(patch.tag ? { tag: patch.tag } : {}),
      ...(patch.tone ? { tone: normalizeHighlightTone(patch.tone) } : {}),
      ...dwell,
    };
  }
  if (base && !patch) return { ...base };
  return {
    selector: patch!.selector ?? base!.selector,
    label: patch!.label,
    ...(patch!.detail !== undefined
      ? { detail: patch!.detail }
      : base!.detail
        ? { detail: base!.detail }
        : {}),
    ...(patch!.tag !== undefined ? { tag: patch!.tag } : base!.tag ? { tag: base!.tag } : {}),
    ...(patch!.tone !== undefined
      ? { tone: normalizeHighlightTone(patch!.tone) }
      : base!.tone
        ? { tone: normalizeHighlightTone(base!.tone) }
        : {}),
    ...dwell,
  };
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

/**
 * Resolve ordered highlight slots for a phase, merging flow fixtures over block stubs.
 * Shim: empty stubAfter + legacy `instruction.highlights` -> auto-keyed stubAfter.
 * `stubOnError` is fail-path only (demo step catch) - never run on success.
 */
export function resolveHighlightSlots(
  block: Block<any, any>,
  phase: HighlightStubPhaseName,
  opts?: {
    out?: Checkpoint<string>;
    fixtures?: HighlightFixtureMap;
  },
): ResolvedHighlight[] {
  const instr = block.instruction as {
    stubBefore?: HighlightStubPhaseOrFn<any>;
    stubAfter?: HighlightStubPhaseOrFn<any>;
    stubOnError?: HighlightStubPhaseOrFn<any>;
    highlights?: readonly WaygraphHighlight[] | ((out: any) => readonly WaygraphHighlight[]);
  };
  let raw: HighlightStubPhaseOrFn<any> | undefined =
    phase === "stubBefore"
      ? instr.stubBefore
      : phase === "stubAfter"
        ? instr.stubAfter
        : instr.stubOnError;
  let phaseMap: HighlightStubPhase = {};
  if (typeof raw === "function") {
    try {
      phaseMap = raw(opts?.out ?? { __state: "" }) || {};
    } catch {
      phaseMap = {};
    }
  } else if (isStubPhase(raw)) {
    phaseMap = { ...raw };
  }

  if (phase === "stubAfter" && Object.keys(phaseMap).length === 0 && instr.highlights) {
    let legacy = instr.highlights;
    if (typeof legacy === "function") {
      try {
        legacy = legacy(opts?.out ?? { __state: "" });
      } catch {
        legacy = [];
      }
    }
    phaseMap = phaseFromLegacyHighlights(Array.isArray(legacy) ? legacy : []);
  }

  const fixturePhase = opts?.fixtures?.[block.name]?.[phase];
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

/**
 * True when the block authored a non-empty stubAfter (after resolve + shim),
 * including legacy highlights. When true, demo should not use verify-trait fallback.
 */
export function hasAuthoredStubAfter(
  block: Block<any, any>,
  out?: Checkpoint<string>,
  fixtures?: HighlightFixtureMap,
): boolean {
  return resolveHighlightSlots(block, "stubAfter", {
    ...(out !== undefined ? { out } : {}),
    ...(fixtures !== undefined ? { fixtures } : {}),
  }).length > 0;
}

/**
 * True when stubOnError resolves to at least one ring (block and/or flow fixture).
 * Demo fail path only - success never consults this.
 */
export function hasAuthoredStubOnError(
  block: Block<any, any>,
  fixtures?: HighlightFixtureMap,
): boolean {
  return (
    resolveHighlightSlots(block, "stubOnError", {
      ...(fixtures !== undefined ? { fixtures } : {}),
    }).length > 0
  );
}
