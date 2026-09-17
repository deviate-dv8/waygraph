/**
 * Block stubBefore / stubAfter + flow highlightFixtures + demo slides.
 * Demo narration only - never affects runGraph pass/fail.
 *
 * Lifecycle (stubs) ≠ yap slides: stubs are fill/after rings tied to the block;
 * slides are multi-step captions with Next between them (long-process explain).
 */

import type { Block, Checkpoint } from "./types.js";

/** One named highlight slot on a block (selector + caption). */
export interface WaygraphHighlightStub {
  selector: string;
  /** Primary caption line. */
  label: string;
  /** Extra caption line (ring / slide body). */
  detail?: string;
  /** Short badge, e.g. AC / BUG / GATE / YAP. */
  tag?: string;
}

/** Flow fixture patch: label required; selector optional (inherits from stub). */
export type WaygraphHighlightFixture = Partial<Pick<WaygraphHighlightStub, "selector">> &
  Required<Pick<WaygraphHighlightStub, "label">> &
  Pick<WaygraphHighlightStub, "detail" | "tag">;

export type HighlightStubPhase = Record<string, WaygraphHighlightStub>;

export type HighlightStubPhaseOrFn<Out extends Checkpoint<string>> =
  | HighlightStubPhase
  | ((out: Out) => HighlightStubPhase);

/**
 * One yap/slide in a multi-step demo caption sequence.
 * Not block lifecycle - demo pauses (Next / auto-next) between slides.
 */
export interface WaygraphSlide {
  /** Primary caption (required). */
  caption: string;
  detail?: string;
  tag?: string;
  /** Optional ring while this slide is showing. */
  selector?: string;
}

export type WaygraphSlidesOrFn<Out extends Checkpoint<string>> =
  | readonly WaygraphSlide[]
  | ((out: Out) => readonly WaygraphSlide[]);

/** Per-block fixture map attached to a Flow via {@link withHighlightFixtures}. */
export type HighlightFixtureMap = Record<
  string,
  {
    stubBefore?: Record<string, WaygraphHighlightFixture>;
    stubAfter?: Record<string, WaygraphHighlightFixture>;
    /** Override / supply multi-step yap slides for this block (demo only). */
    slides?: readonly WaygraphSlide[];
  }
>;

/** Legacy array highlight (shimmed to stubAfter keys "0", "1", ...). */
export interface WaygraphHighlight {
  selector: string;
  label: string;
}

export type ResolvedHighlight = WaygraphHighlightStub;

function isStubPhase(v: unknown): v is HighlightStubPhase {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergeSlot(
  base: WaygraphHighlightStub | undefined,
  patch: WaygraphHighlightFixture | undefined,
): WaygraphHighlightStub | null {
  if (!base && !patch) return null;
  if (!base && patch) {
    if (!patch.selector) return null;
    return {
      selector: patch.selector,
      label: patch.label,
      ...(patch.detail ? { detail: patch.detail } : {}),
      ...(patch.tag ? { tag: patch.tag } : {}),
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
  };
}

function phaseFromLegacyHighlights(
  highlights: readonly WaygraphHighlight[] | undefined,
): HighlightStubPhase {
  const out: HighlightStubPhase = {};
  if (!highlights) return out;
  highlights.forEach((h, i) => {
    if (h && typeof h.selector === "string" && typeof h.label === "string") {
      out[String(i)] = { selector: h.selector, label: h.label };
    }
  });
  return out;
}

/**
 * Resolve ordered highlight slots for a phase, merging flow fixtures over block stubs.
 * Shim: empty stubAfter + legacy `instruction.highlights` -> auto-keyed stubAfter.
 */
export function resolveHighlightSlots(
  block: Block<any, any>,
  phase: "stubBefore" | "stubAfter",
  opts?: {
    out?: Checkpoint<string>;
    fixtures?: HighlightFixtureMap;
  },
): ResolvedHighlight[] {
  const instr = block.instruction as {
    stubBefore?: HighlightStubPhaseOrFn<any>;
    stubAfter?: HighlightStubPhaseOrFn<any>;
    highlights?: readonly WaygraphHighlight[] | ((out: any) => readonly WaygraphHighlight[]);
  };
  let raw: HighlightStubPhaseOrFn<any> | undefined =
    phase === "stubBefore" ? instr.stubBefore : instr.stubAfter;
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

/** Caption for ring / slide UI (label|caption + optional detail/tag). */
export function formatHighlightCaption(
  h: { label?: string; caption?: string; detail?: string; tag?: string },
): string {
  const primary = h.caption ?? h.label ?? "";
  const tag = h.tag ? `[${h.tag}] ` : "";
  if (h.detail) return `${tag}${primary} - ${h.detail}`;
  return `${tag}${primary}`;
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
