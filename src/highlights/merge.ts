// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { FixtureDurationFields, HighlightStubPhase, HighlightStubPhaseName, HighlightStubPhaseOrFn, ResolvedHighlight, WaygraphHighlight, WaygraphHighlightFixture, WaygraphHighlightStub } from "./types.js";
import { normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight } from "./style.js";
import type { Block, Checkpoint } from "../types.js";

export function isStubPhase(v: unknown): v is HighlightStubPhase {
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


export function applyDefaultZoom(slots: ResolvedHighlight[], defaultZoom?: number): ResolvedHighlight[] {
  if (defaultZoom === undefined || !(defaultZoom > 0)) return slots;
  return slots.map((h) => (h.zoom !== undefined && h.zoom > 0 ? h : { ...h, zoom: defaultZoom }));
}


export function applyDefaultZoomOut(
  slots: ResolvedHighlight[],
  defaultZoomOut?: boolean,
): ResolvedHighlight[] {
  if (defaultZoomOut === undefined) return slots;
  return slots.map((h) =>
    h.zoomOut !== undefined ? h : { ...h, zoomOut: defaultZoomOut },
  );
}


export function mergePhaseMaps(
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


export function readStubRaw(
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


export function applyLegacyHighlightsShim(
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
