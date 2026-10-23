import type { HighlightStubPhase, HighlightStubPhaseName, HighlightStubPhaseOrFn, ResolvedHighlight, WaygraphHighlightStub } from "../../engine/narration.js";
import { normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight } from "./style.js";
import type { Block } from "../../engine/block/block.js";

export function isStubPhase(v: unknown): v is HighlightStubPhase {
  return !!v && typeof v === "object" && !Array.isArray(v);
}


function zoomOf(slot: WaygraphHighlightStub): Pick<WaygraphHighlightStub, "zoom"> {
  return slot.zoom !== undefined && Number.isFinite(slot.zoom) && slot.zoom > 0 ? { zoom: slot.zoom } : {};
}


function fxOf(slot: WaygraphHighlightStub): Pick<WaygraphHighlightStub, "focus" | "color" | "cursor" | "todo" | "gesture"> {
  const out: Pick<WaygraphHighlightStub, "focus" | "color" | "cursor" | "todo" | "gesture"> = {};
  if (slot.focus !== undefined) out.focus = !!slot.focus;
  if (slot.color !== undefined && String(slot.color).trim()) out.color = String(slot.color).trim();
  if (slot.cursor !== undefined) out.cursor = !!slot.cursor;
  if (slot.todo !== undefined && String(slot.todo).trim()) out.todo = String(slot.todo).trim();
  if (slot.gesture === "tap" || slot.gesture === "hold" || slot.gesture === "click" || slot.gesture === "swipe") {
    out.gesture = slot.gesture;
  }
  return out;
}


/** A Block's own stub slot with its style fields normalized. */
function normalizeSlot(slot: WaygraphHighlightStub | undefined): WaygraphHighlightStub | null {
  if (!slot) return null;
  return {
    ...slot,
    ...(slot.tone ? { tone: normalizeHighlightTone(slot.tone) } : {}),
    ...(slot.size ? { size: normalizeHighlightSize(slot.size) } : {}),
    ...(slot.weight ? { weight: normalizeHighlightWeight(slot.weight) } : {}),
    ...zoomOf(slot),
    ...fxOf(slot),
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


/** A stub phase's slot map as an ordered list of resolved highlights. */
export function resolvePhaseMap(phaseMap: HighlightStubPhase): ResolvedHighlight[] {
  const phaseKeys = Object.keys(phaseMap);
  const allNumeric =
    phaseKeys.length > 0 && phaseKeys.every((k) => Number.isFinite(Number(k)) && String(Number(k)) === k);
  // Numeric stub ids (legacy "0","1") sort by number. Named stubs keep author
  // insertion order - localeCompare used to reorder password/submit/username
  // and advance the wrong todo index on fill.
  const ordered = allNumeric ? [...phaseKeys].sort((a, b) => Number(a) - Number(b)) : phaseKeys;
  const resolved: ResolvedHighlight[] = [];
  for (const id of ordered) {
    const merged = normalizeSlot(phaseMap[id]);
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
