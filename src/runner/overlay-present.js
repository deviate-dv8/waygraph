// Presents a resolved stub phase ("waygraph overlay fixtures": ctx.todos / device / title / banner ...) on a LIVE page
// for the session surfaces (auto / browser / pilot). Same OverlayStage + same in-page installers + same verbose log
// lines as `waygraph demo`, so an overlay fixture behaves identically on every surface. Rings are painted separately
// (pilot holds them; demo cycles them) - that is the only intended difference.
import { installOverlay } from "./overlay-install.js";
import { createOverlayStage } from "./overlay-stage.js";
import { demoLog, logStubPhaseFixtures, logTodoDockFull, setDemoLogSurface, summarizeDevice } from "./demo-log.js";
import { logBannerDom, probeBanner } from "./banner-log.js";
import { probeTodoDocksOnPage } from "./todo-dock.js";

export function createSessionOverlay(page, surface) {
  setDemoLogSurface(surface);
  const stage = createOverlayStage(page, { todoDockRef: { current: undefined }, deviceRef: { current: undefined } });
  let title = undefined;
  let painted = false;

  const paintChrome = async (phaseParallel) => {
    await installOverlay(page, title, stage.state.lastBannerUi);
    await stage.syncAllTodoDocks({ parallel: !!phaseParallel });
  };

  return {
    stage,
    /** Apply one phase (tag = before | after | error | highlight) and log the resulting overlay state. */
    async present(tag, phase) {
      setDemoLogSurface(surface);
      logStubPhaseFixtures(tag, phase);
      await stage.pushTodoDockUi(phase.todoDockUi);
      const { appliedTodo, appliedDevice } = await stage.applyPhase(phase, { reapplyDeviceOnKeep: true });
      if (phase.title && String(phase.title).trim()) title = String(phase.title).trim();
      const wantsChrome = !!(title || stage.state.lastTodoDock || phase.todoSync === "set");
      if (wantsChrome) {
        painted = true;
        await paintChrome(phase.todoParallel);
      }
      logTodoDockFull(stage.state.lastTodoDock, "  " + tag);
      demoLog("  " + tag + " device=" + summarizeDevice(stage.state.lastDevice) + " deviceSync=" + appliedDevice.sync);
      demoLog("  " + tag + " todoSync=" + appliedTodo.sync);
      const docks = await probeTodoDocksOnPage(page);
      if (!docks.length && stage.state.lastTodoDock && appliedTodo.sync !== "clear") {
        demoLog("  WARN " + tag + ": todos authored but dock-dom empty (not painted?)");
      }
      for (const d of docks) {
        demoLog(
          "  " + tag + " dock-dom " + d.key + "@" + d.pos + " " + d.left + "," + d.top + " " + d.w + "x" + d.h +
            (d.onScreen ? "" : " OFFSCREEN") + " n=" + d.n + (d.current ? ' cur="' + d.current + '"' : ""),
        );
      }
      if (title || painted) logBannerDom(tag, await probeBanner(page));
    },
    /** A navigation wipes the overlay DOM: rebuild what was authored (same job as the demo's post-navigation restore). */
    async restore() {
      if (!painted) return;
      await paintChrome(false);
    },
  };
}
