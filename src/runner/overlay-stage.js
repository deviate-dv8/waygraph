// The waygraph OVERLAY stage: one owner of overlay state (todo docks, device, banner UX) and of how a resolved
// stub phase is applied to the page. demo / auto / browser / pilot all go through this, so a "waygraph overlay
// fixture" (ctx.todos / ctx.device / ctx.title / ...) means the same thing on every surface.
// NOT Playwright test fixtures - these paint the waygraph overlay on the page under test.
import { applyDevicePhase, applyTodoPhase, resolveTodoDockUi } from "../highlights.js";
import { applyDeviceToPage } from "./device-stage.js";
import { bannerUiFromPhase } from "./banner-log.js";

export function createOverlayStage(page, { todoDockRef, deviceRef }) {
  /** Carried across steps: omitting a fixture in a later phase = keep (todos, device, banner UX). */
  const state = { lastTodoDock: undefined, lastDevice: undefined, lastBannerUi: {} };
  /** Author todoDockUi patches (merged); resolved against env each step. */
  let lastTodoDockUiPatch = undefined;
  /** Multi-todo: every dock keyed by todoId (or "_default"), survives navigation. */
  const todoDockById = new Map();

  const pushTodoDockUi = async (patch) => {
    if (patch && typeof patch === "object") {
      lastTodoDockUiPatch = { ...(lastTodoDockUiPatch || {}), ...patch };
    }
    const ui = resolveTodoDockUi(lastTodoDockUiPatch);
    await page
      .evaluate((u) => {
        window.__wgTodoDockUi = u;
      }, ui)
      .catch(() => {});
  };
  const dockRegistryKey = (dock) =>
    dock && dock.id && String(dock.id).trim() ? String(dock.id).trim() : "_default";
  const rememberTodoDock = (dock, sync, parallel) => {
    if (sync === "clear") {
      todoDockById.clear();
      return;
    }
    if (sync === "set" && dock) {
      if (!parallel) todoDockById.clear();
      todoDockById.set(dockRegistryKey(dock), dock);
      return;
    }
    // keep: refresh / re-seed so syncAllTodoDocks never sees an empty map
    // while lastTodoDock still carries (nav wipe + mid-act advance).
    if (sync === "keep" && dock) {
      todoDockById.set(dockRegistryKey(dock), dock);
    }
  };
  const syncAllTodoDocks = async (opts) => {
    const docks = [...todoDockById.values()];
    const parallel = !!(opts && opts.parallel);
    if (!docks.length) {
      // Empty registry: do NOT clear the DOM. renderBefore/After may have
      // just painted from lastTodoDock (keep). Clearing here made todos
      // vanish until the next ctx.todos() set (PIA #15).
      return;
    }
    await page
      .evaluate(
        ({ list, parallel }) => {
          if (!window.__wgSyncTodos) return;
          for (let i = 0; i < list.length; i++) {
            const d = list[i];
            window.__wgSyncTodos({
              sync: "set",
              dock: d,
              todoId: (d && d.id) || null,
              pos: (d && d.pos) || null,
              // First dock replaces; later ones keep siblings when parallel.
              replace: !(parallel && i > 0),
              parallel: parallel && i > 0,
            });
          }
        },
        { list: docks, parallel },
      )
      .catch(() => {});
  };

  /**
   * Merge one resolved stub phase (banner UX, todo dock, device) into the carried state and push it to the page.
   * `reapplyDeviceOnKeep`: also re-apply the carried device when the phase says keep (after a navigation wipe).
   */
  const applyPhase = async (phase, { reapplyDeviceOnKeep = false } = {}) => {
    state.lastBannerUi = { ...state.lastBannerUi, ...bannerUiFromPhase(phase) };
    const appliedTodo = applyTodoPhase(state.lastTodoDock, {
      todoSync: phase.todoSync,
      todoDock: phase.todoDock,
      todos: phase.todos,
      todoPos: phase.todoPos,
    });
    state.lastTodoDock = appliedTodo.dock;
    todoDockRef.current = state.lastTodoDock;
    rememberTodoDock(appliedTodo.dock, appliedTodo.sync, !!phase.todoParallel);
    const appliedDevice = applyDevicePhase(state.lastDevice, {
      deviceSync: phase.deviceSync,
      device: phase.device,
    });
    state.lastDevice = appliedDevice.device;
    deviceRef.current = state.lastDevice;
    if (appliedDevice.sync !== "keep" || (reapplyDeviceOnKeep && state.lastDevice)) {
      await applyDeviceToPage(page, state.lastDevice, appliedDevice.sync);
    }
    return { appliedTodo, appliedDevice };
  };

  return { state, pushTodoDockUi, rememberTodoDock, syncAllTodoDocks, applyPhase };
}
