// Plays a Block's narration for one phase (stubBefore / stubAfter / stubOnError): runs its ctx stub and returns the
// rings, todos, device, title and caption it set, for the overlay to paint.
import type { DeviceState } from "../../engine/stub/viewport.js";
import type { HighlightStubPhaseName, StubBagState, StubPhaseResult } from "../../engine/stub/stub.js";
import type { ResolvedHighlight, WaygraphSlide, WaygraphSlidesOrFn } from "../../engine/stub/ring.js";
import { createStubCtx } from "./stub-ctx.js";
import { applyDefaultZoom, applyDefaultZoomOut, readStubRaw, resolvePhaseMap } from "./merge.js";
import { buildTodoDock, normalizeTodoStyle, normalizeTodos } from "./todo-dock.js";
import { resolveDeviceState } from "./device.js";
import type { SomeBlock } from "../../engine/block/block.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { MemPage } from "../../engine/mem/mem.js";

/**
 * Run an open stub lifecycle (preferred) or resolve a static slot map.
 * Returns rings + episode fixtures (todos / todoIndex / zoom).
 *
 * @example
 * const before = await runStubPhase(block, "stubBefore", { mem });
 * // before.todos, before.highlights
 */
export async function runStubPhase(
  block: SomeBlock,
  phase: HighlightStubPhaseName,
  opts?: {
    out?: Checkpoint<string> | undefined;
    error?: unknown;
    mem?: MemPage | undefined;
  },
): Promise<StubPhaseResult> {
  const bag: StubBagState = { highlights: {} };
  const ctx = createStubCtx(bag, {
    ...(opts?.out !== undefined ? { out: opts.out } : {}),
    ...(opts?.error !== undefined ? { error: opts.error } : {}),
    ...(opts?.mem !== undefined ? { mem: opts.mem } : {}),
  });
  const raw = readStubRaw(block, phase);

  if (raw) {
    try {
      await raw(ctx);
    } catch (err) {
      // A mistake in the author's stub: shown on the step (the demo's failure panel), never dropped.
      throw new Error(`${block.name}: its ${phase} stub threw: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }


  let highlights = applyDefaultZoom(resolvePhaseMap(bag.highlights), bag.zoom);
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
    ...(bag.titlePos !== undefined ? { titlePos: bag.titlePos } : {}),
    ...(bag.bannerUi !== undefined ? { bannerUi: bag.bannerUi } : {}),
    // Unlike title, "" is meaningful here (ctx.hideCaption()/caption("")) - forwarded so it can
    // actually hide the bar, not filtered out the way an empty title is (title's own "" means
    // "author didn't touch it this step", handled by simply omitting the field).
    ...(bag.caption !== undefined ? { caption: bag.caption } : {}),
    // Boolean, not string - "" isn't a state here, so a plain undefined-check (like zoom/title)
    // is enough; false is real ("author called hideNetworkTab()") and must still be forwarded.
    ...(bag.networkTabVisible !== undefined ? { networkTabVisible: bag.networkTabVisible } : {}),
    ...(bag.todoPos !== undefined ? { todoPos: bag.todoPos } : {}),
    ...(bag.todoDockUi !== undefined ? { todoDockUi: bag.todoDockUi } : {}),
    ...(bag.todoParallel === true ? { todoParallel: true } : {}),
  };
}


/**
 * Sync resolve of highlight slots. Prefer {@link runStubPhase} for open
 * async lifecycles + episode fixtures (todos/zoom).
 */
export function resolveHighlightSlots(
  block: SomeBlock,
  phase: HighlightStubPhaseName,
  opts?: {
    out?: Checkpoint<string>;
  },
): ResolvedHighlight[] {
  const bag: StubBagState = { highlights: {} };
  const raw = readStubRaw(block, phase);
  if (raw) {
    // Synchronous read: the rings a stub paints before its first await.
    try {
      void raw(createStubCtx<Checkpoint<string>>(bag, { ...(opts?.out !== undefined ? { out: opts.out } : {}) }));
    } catch (err) {
      throw new Error(`${block.name}: its ${phase} stub threw: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
  return applyDefaultZoom(resolvePhaseMap(bag.highlights), bag.zoom);
}


/** Resolve multi-step yap slides from `instruction.slides` (function form allowed). */
export function resolveSlides(
  block: SomeBlock,
  opts?: {
    out?: Checkpoint<string>;
  },
): WaygraphSlide[] {
  const instr: { slides?: WaygraphSlidesOrFn<Checkpoint<string>> | undefined } = block.instruction;
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


function stubPhaseLooksAuthored(
  block: SomeBlock,
  phase: HighlightStubPhaseName,
): boolean {
  return readStubRaw(block, phase) !== undefined;
}


/**
 * True when the block authored stubAfter (lifecycle fn or slots).
 * When true, demo should not use verify-trait fallback.
 */
export function hasAuthoredStubAfter(
  block: SomeBlock,
  out?: Checkpoint<string>,
): boolean {
  if (stubPhaseLooksAuthored(block, "stubAfter")) return true;
  return resolveHighlightSlots(block, "stubAfter", out !== undefined ? { out } : {}).length > 0;
}


/**
 * True when stubOnError is authored (lifecycle fn and/or rings).
 * Demo fail path only - success never consults this.
 */
export function hasAuthoredStubOnError(block: SomeBlock): boolean {
  if (stubPhaseLooksAuthored(block, "stubOnError")) return true;
  return resolveHighlightSlots(block, "stubOnError").length > 0;
}
