import type { BannerPos, StubBagState, StubCtx } from "../../engine/stub/stub.js";
import type { WaygraphTodosOpts } from "../../engine/stub/todos.js";
import { normalizeTodoPos, normalizeTodoStyle } from "./todo-dock.js";
import { applyOrientation, normalizeDeviceOrientation, resolveDeviceState } from "./device.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { MemPage } from "../../engine/mem/mem.js";

export function createStubCtx<Out extends Checkpoint<string>>(
  bag: StubBagState,
  opts: { out?: Out; error?: unknown; mem?: MemPage },
): StubCtx<Out> {
  /** One dock per id: its title, style and side; without `parallel` it replaces the dock on screen. */
  const setDock = (id: string, opts: Omit<WaygraphTodosOpts, "index">): void => {
    bag.todoTouched = true;
    bag.hideTodos = false;
    delete bag.todoGroups;
    const cleaned = id.trim();
    if (cleaned) bag.todoId = cleaned;
    else delete bag.todoId;
    if (opts.title != null) bag.todoTitle = String(opts.title);
    const style = normalizeTodoStyle(opts.style);
    if (style) bag.todoStyle = style;
    const pos = normalizeTodoPos(opts.pos);
    if (pos) bag.todoPos = pos;
    bag.todoParallel = opts.parallel === true;
  };
  return {
    mem: opts.mem,
    out: opts.out,
    error: opts.error,
    ring(id, stub) {
      bag.highlights = { ...bag.highlights, [id]: stub };
    },
    todos(id, items, opts = {}) {
      setDock(id, opts);
      bag.todos = items;
      if (opts.index != null) bag.todoIndex = Number(opts.index);
      if (!items.length) bag.hideTodos = true;
    },
    todoIndex(n) {
      bag.todoIndex = n;
    },
    todoGroups(id, groups, opts = {}) {
      setDock(id, opts);
      bag.todoGroups = groups;
      if (!groups.length) bag.hideTodos = true;
    },
    hideTodos() {
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
    hideDevice() {
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
    title(text, opts) {
      bag.title = String(text ?? "");
      const p = normalizeBannerPos(opts?.pos);
      if (p) bag.titlePos = p;
    },
    titlePos(side) {
      const p = normalizeBannerPos(side);
      if (p) bag.titlePos = p;
    },
    caption(text) {
      bag.caption = String(text ?? "");
    },
    slides(slides) {
      bag.slides = slides;
    },
    hideCaption() {
      bag.caption = "";
    },
    showNetworkTab() {
      bag.networkTabVisible = true;
    },
    hideNetworkTab() {
      bag.networkTabVisible = false;
    },
    bannerUi(opts) {
      if (!opts || typeof opts !== "object") return;
      bag.bannerUi = { ...(bag.bannerUi || {}), ...opts };
    },
    hideBanner() {
      bag.bannerUi = { ...(bag.bannerUi || {}), hidden: true };
    },
    todoDockUi(opts) {
      if (!opts || typeof opts !== "object") return;
      bag.todoDockUi = { ...(bag.todoDockUi || {}), ...opts };
    },
  };
}


function normalizeBannerPos(raw: unknown): BannerPos | undefined {
  const v = String(raw ?? "").toLowerCase();
  return v === "left" || v === "center" || v === "right" ? v : undefined;
}
