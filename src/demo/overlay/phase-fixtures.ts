import type { StubPhaseResult } from "../../engine/stub/stub.js";
import type { PilotHighlightFixtures } from "./pilot/fixtures.js";

/**
 * The reverse: a resolved stub phase (what `runStubPhase` returns for a Block's stubBefore/After/OnError)
 * -> what the Pilot painter takes. Lets `auto/browser/pilot send` paint a Block's authored waygraph overlay
 * fixtures (rings, todos, device, zoom, title/banner) the way `waygraph demo` does, instead of only recording
 * them in the trace.
 */
export function phaseToOverlayFixtures(phase: StubPhaseResult, holdMs = 6000): PilotHighlightFixtures {
  const items = phase.todoDock?.groups[0]?.items ?? phase.todos;
  const idx = items.findIndex((t) => t.current) >= 0 ? items.findIndex((t) => t.current) : items.findIndex((t) => !t.done);
  return {
    rings: phase.highlights.map((h) => ({
      selector: h.selector,
      label: h.label ?? "",
      ...(h.detail ? { detail: h.detail } : {}),
      ...(h.tag ? { tag: h.tag } : {}),
      ...(h.tone ? { tone: h.tone } : {}),
      ...(h.size ? { size: h.size } : {}),
      ...(h.weight ? { weight: h.weight } : {}),
      ...(h.color ? { color: h.color } : {}),
      ...(h.zoom !== undefined ? { zoom: h.zoom } : {}),
      ...(h.zoomOut !== undefined ? { zoomOut: h.zoomOut } : {}),
      ...(h.focus ? { focus: true } : {}),
    })),
    ...(phase.todoSync === "set" && items.length
      ? {
          todos: items.map((t) => t.text),
          todoIndex: idx < 0 ? items.length : idx,
          ...(phase.todoDock?.groups[0]?.title ? { todoTitle: phase.todoDock.groups[0].title } : {}),
          ...(phase.todoPos ? { todoPos: phase.todoPos } : {}),
        }
      : {}),
    ...(phase.todoDockUi ? { todoDockUi: phase.todoDockUi } : {}),
    ...(phase.deviceSync === "set" && phase.device ? { device: phase.device } : {}),
    ...(phase.zoom !== undefined ? { zoom: phase.zoom } : {}),
    ...(phase.zoomOut !== undefined ? { zoomOut: phase.zoomOut } : {}),
    ...(phase.title ? { title: phase.title } : {}),
    ...(phase.titlePos ? { titlePos: phase.titlePos } : {}),
    ...(phase.bannerUi ? { bannerUi: phase.bannerUi } : {}),
    holdMs,
  };
}

/** One verbose line per authored overlay fixture - same wording on every surface so a log reader (or an AI with no eyes) can tell what was painted. */
export function describeOverlayFixtures(tag: string, f: PilotHighlightFixtures): string[] {
  const out: string[] = [];
  if (f.title) out.push(`${tag} ctx.title(${JSON.stringify(f.title)})${f.titlePos ? ` pos=${f.titlePos}` : ""}`);
  if (f.bannerUi) out.push(`${tag} ctx.bannerUi(${JSON.stringify(f.bannerUi)})`);
  if (f.todos?.length) out.push(`${tag} ctx.todos n=${f.todos.length} index=${f.todoIndex ?? 0}${f.todoPos ? ` pos=${f.todoPos}` : ""}`);
  if (f.todoUi) out.push(`${tag} todoUi ${JSON.stringify(f.todoUi)}`);
  if (f.device) out.push(`${tag} ctx.device(${typeof f.device === "string" ? f.device : f.device.preset ?? "custom"})`);
  if (f.zoom) out.push(`${tag} ctx.zoom(${f.zoom})`);
  for (const r of f.rings ?? []) out.push(`${tag} ring ${r.selector} tone=${r.tone ?? "planned"} label=${JSON.stringify(r.label)}`);
  return out;
}
