// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { DeviceState, HighlightFixtureMap, HighlightStubPhase, HighlightStubPhaseName, ResolvedHighlight, StubBagState, StubCtx, StubLifecycleFn, StubPhaseResult, WaygraphSlide, WaygraphSlidesOrFn } from "./types.js";
import { createStubCtx, liftLegacySlotTodos } from "./stub-ctx.js";
import { applyDefaultZoom, applyDefaultZoomOut, applyLegacyHighlightsShim, isStubPhase, mergePhaseMaps, readStubRaw } from "./merge.js";
import { buildTodoDock, normalizeTodoStyle, normalizeTodos } from "./todo-dock.js";
import { resolveDeviceState } from "./device.js";
import type { Block, Checkpoint } from "../types.js";
import type { MemPage } from "../mem-page.js";

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
    mem?: MemPage;
    fixtures?: HighlightFixtureMap;
  },
): Promise<StubPhaseResult> {
  const bag: StubBagState = { highlights: {} };
  const ctx = createStubCtx(bag, {
    ...(opts?.out !== undefined ? { out: opts.out } : {}),
    ...(opts?.error !== undefined ? { error: opts.error } : {}),
    ...(opts?.mem !== undefined ? { mem: opts.mem } : {}),
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
    ...(bag.todoDockUi !== undefined ? { todoDockUi: bag.todoDockUi } : {}),
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
