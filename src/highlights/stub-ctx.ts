// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { StubBagState, StubCtx, WaygraphHighlightStub, WaygraphTodoInput, WaygraphTodosOpts } from "./types.js";
import { normalizeTodoPos, normalizeTodoStyle } from "./todo-dock.js";
import { applyOrientation, normalizeDeviceOrientation, resolveDeviceState } from "./device.js";
import type { Checkpoint } from "../types.js";
import type { MemPage } from "../mem-page.js";

export function createStubCtx<Out extends Checkpoint<string>>(
  bag: StubBagState,
  opts: { out?: Out; error?: unknown; mem?: MemPage },
): StubCtx<Out> {
  return {
    mem: opts.mem,
    out: opts.out,
    error: opts.error,
    highlights(slots) {
      bag.highlights = { ...(slots || {}) };
    },
    ring(id, stub) {
      bag.highlights = { ...bag.highlights, [id]: stub };
    },
    todos(a: string | readonly WaygraphTodoInput[], b?: readonly WaygraphTodoInput[] | WaygraphTodosOpts, c?: WaygraphTodosOpts) {
      bag.todoTouched = true;
      bag.hideTodos = false;
      delete bag.todoGroups;
      if (typeof a === "string") {
        const id = String(a).trim();
        if (id) bag.todoId = id;
        else delete bag.todoId;
        const items = (Array.isArray(b) ? b : []) as readonly WaygraphTodoInput[];
        bag.todos = items;
        const opts = (c && typeof c === "object" ? c : {}) as WaygraphTodosOpts;
        if (opts.title != null) bag.todoTitle = String(opts.title);
        if (opts.index != null) bag.todoIndex = Number(opts.index);
        const st = normalizeTodoStyle(opts.style);
        if (st) bag.todoStyle = st;
        const pos = normalizeTodoPos(opts.pos);
        if (pos) bag.todoPos = pos;
        bag.todoParallel = opts.parallel === true;
        if (!items.length) bag.hideTodos = true;
        return;
      }
      bag.todos = a;
      // Legacy list-only form: leave parallel unset (CLI treats as replace).
      delete bag.todoParallel;
      if (!a || !a.length) bag.hideTodos = true;
    },
    todoIndex(n) {
      bag.todoIndex = n;
    },
    todoTitle(text) {
      bag.todoTitle = String(text ?? "");
    },
    todoId(id) {
      bag.todoTouched = true;
      const cleaned = String(id ?? "").trim();
      if (cleaned) bag.todoId = cleaned;
      else delete bag.todoId;
    },
    todoStyle(style) {
      const s = normalizeTodoStyle(style);
      if (s) bag.todoStyle = s;
    },
    todoGroups(groups) {
      bag.todoTouched = true;
      bag.hideTodos = false;
      bag.todoGroups = groups;
      if (!groups || !groups.length) bag.hideTodos = true;
    },
    hideTodos() {
      bag.todoTouched = true;
      bag.hideTodos = true;
      bag.todos = [];
      delete bag.todoGroups;
    },
    clearTodos() {
      bag.todoTouched = true;
      bag.hideTodos = true;
      bag.todos = [];
      delete bag.todoGroups;
    },
    device(preset) {
      bag.deviceTouched = true;
      bag.hideDevice = false;
      const resolved = resolveDeviceState(preset, bag.touchOverride, bag.orientationOverride);
      if (resolved) {
        bag.device = resolved;
        if (resolved.preset === "desktop" && !resolved.touchMode) {
          bag.hideDevice = true;
        }
      }
    },
    viewport(box) {
      bag.deviceTouched = true;
      bag.hideDevice = false;
      const resolved = resolveDeviceState(box, bag.touchOverride, bag.orientationOverride);
      if (resolved) bag.device = resolved;
    },
    touch(on) {
      bag.deviceTouched = true;
      const enabled = on === undefined ? true : !!on;
      bag.touchOverride = enabled;
      if (enabled) bag.hideDevice = false;
      if (bag.device) {
        bag.device = {
          ...bag.device,
          touchMode: enabled,
          hasTouch: bag.device.hasTouch || enabled,
        };
        if (enabled) bag.hideDevice = false;
      } else if (enabled) {
        const base = resolveDeviceState("desktop", true, bag.orientationOverride);
        if (base) bag.device = { ...base, touchMode: true, hasTouch: true };
      }
    },
    orientation(o) {
      const want = normalizeDeviceOrientation(o);
      if (!want) return;
      bag.deviceTouched = true;
      bag.hideDevice = false;
      bag.orientationOverride = want;
      const base =
        bag.device ||
        resolveDeviceState("mobile", bag.touchOverride) ||
        resolveDeviceState("mobile");
      if (base) bag.device = applyOrientation(base, want);
    },
    landscape() {
      this.orientation("landscape");
    },
    portrait() {
      this.orientation("portrait");
    },
    hideDevice() {
      bag.deviceTouched = true;
      bag.hideDevice = true;
      bag.device = resolveDeviceState("desktop", false);
      bag.touchOverride = false;
      bag.orientationOverride = undefined;
    },
    clearDevice() {
      bag.deviceTouched = true;
      bag.hideDevice = true;
      bag.device = resolveDeviceState("desktop", false);
      bag.touchOverride = false;
      bag.orientationOverride = undefined;
    },
    zoom(n) {
      if (Number.isFinite(n) && n > 0) bag.zoom = n;
    },
    zoomOut(keep) {
      bag.zoomOut = !!keep;
    },
    title(text) {
      bag.title = String(text ?? "");
    },
    banner(text) {
      bag.title = String(text ?? "");
    },
    todoPos(side) {
      const p = normalizeTodoPos(side);
      if (p) bag.todoPos = p;
    },
    todoDockUi(opts) {
      if (!opts || typeof opts !== "object") return;
      bag.todoDockUi = { ...(bag.todoDockUi || {}), ...opts };
    },
    todoDockFull() {
      bag.todoDockUi = {
        compact: false,
        collision: false,
        behindRing: false,
      };
    },
    set(partial) {
      if (partial.highlights) bag.highlights = { ...partial.highlights };
      if (partial.todos !== undefined) {
        bag.todoTouched = true;
        bag.hideTodos = !partial.todos || !partial.todos.length;
        bag.todos = partial.todos;
        if (partial.todoGroups === undefined) delete bag.todoGroups;
      }
      if (partial.todoIndex !== undefined) bag.todoIndex = partial.todoIndex;
      if (partial.todoTitle !== undefined) bag.todoTitle = String(partial.todoTitle ?? "");
      if (partial.todoId !== undefined) {
        bag.todoTouched = true;
        const cleaned = String(partial.todoId ?? "").trim();
        if (cleaned) bag.todoId = cleaned;
        else delete bag.todoId;
      }
      const ts = normalizeTodoStyle(partial.todoStyle);
      if (ts) bag.todoStyle = ts;
      if (partial.todoGroups !== undefined) {
        bag.todoTouched = true;
        bag.hideTodos = !partial.todoGroups || !partial.todoGroups.length;
        bag.todoGroups = partial.todoGroups;
      }
      if (partial.touch !== undefined) {
        bag.deviceTouched = true;
        bag.touchOverride = !!partial.touch;
      }
      if (partial.orientation !== undefined) {
        const want = normalizeDeviceOrientation(partial.orientation);
        if (want) {
          bag.deviceTouched = true;
          bag.hideDevice = false;
          bag.orientationOverride = want;
          const base =
            bag.device ||
            resolveDeviceState("mobile", bag.touchOverride) ||
            resolveDeviceState("mobile");
          if (base) bag.device = applyOrientation(base, want);
        }
      }
      if (partial.device !== undefined) {
        bag.deviceTouched = true;
        bag.hideDevice = false;
        const resolved = resolveDeviceState(
          partial.device,
          bag.touchOverride,
          bag.orientationOverride,
        );
        if (resolved) {
          bag.device = resolved;
          if (resolved.preset === "desktop" && !resolved.touchMode) bag.hideDevice = true;
        }
      }
      if (partial.viewport !== undefined) {
        bag.deviceTouched = true;
        bag.hideDevice = false;
        const resolved = resolveDeviceState(
          partial.viewport,
          bag.touchOverride,
          bag.orientationOverride,
        );
        if (resolved) bag.device = resolved;
      }
      if (partial.zoom !== undefined && Number.isFinite(partial.zoom) && partial.zoom > 0) {
        bag.zoom = partial.zoom;
      }
      if (partial.zoomOut !== undefined) bag.zoomOut = !!partial.zoomOut;
      if (partial.title !== undefined) bag.title = String(partial.title ?? "");
      const tp = normalizeTodoPos(partial.todoPos);
      if (tp) bag.todoPos = tp;
      if (partial.todoDockUi !== undefined && partial.todoDockUi && typeof partial.todoDockUi === "object") {
        bag.todoDockUi = { ...(bag.todoDockUi || {}), ...partial.todoDockUi };
      }
    },
  };
}


/** Lift legacy per-slot todos (0.12.23) onto the phase bag once. */
export function liftLegacySlotTodos(bag: StubBagState): void {
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
