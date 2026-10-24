// The stepper's panels: before a step (what will happen, its mem), after it (the result and rings), and on failure.
import { ignorePageGone } from "../../engine/page-gone.js";
import { hasAuthoredStubOnError, runStubPhase } from "../narration/narration.js";
import { applyHighlightStyleDefaults, formatHighlightCaption } from "../narration/style.js";
import { installOverlay } from "../overlay/overlay.js";
import { cycleHighlightRings } from "../overlay/rings.js";
import type { WgPage } from "../types.js";

export function miniStepLabel(info: any) {
  const ep =
    info.episodeNumber !== undefined && info.episodeNumber !== null
      ? "Ep " + info.episodeNumber + " \u00b7 "
      : "";
  return (
    ep +
    (info.index + 1) +
    " / " +
    info.total +
    (info.blockName ? " \u00b7 " + info.blockName : "") +
    (info.paceBadge ? " \u00b7 " + info.paceBadge : "")
  );
}


/**
 * stubOnError rings + amber "expected outcome" / red error panel, then wait
 * for Stop/Retry. Used when a step throws OR when a `map({ expectedFailure })` flow's last
 * block succeeds on the intentional fail branch (e.g. LoginPage + error banner).
 */
export async function presentFailPanel(page: WgPage, opts: any) {
  const {
    block,
    error,
    index,
    total,
    blockName,
    message,
    allNames,
    allDescriptions,
    moduleIndex,
    allEpisodes,
    title,
    episodeNumber,
    episodeTitle,
    expectedFailureReason,
    stepperMode,
    gatesFast,
    demoPace,
    gate,
    mem,
  } = opts;
  if (hasAuthoredStubOnError(block)) {
    await page
      .evaluate(() => {
        if (window.__wgRingTrack) {
          window.removeEventListener("resize", window.__wgRingTrack);
          window.removeEventListener("scroll", window.__wgRingTrack, true);
          window.__wgRingTrack = null;
        }
      })
      .catch(ignorePageGone);
    const errPhase = await runStubPhase(block, "stubOnError", {
      error,
      out: opts.out,
      mem,
    });
    const errHighlights = errPhase.highlights.map((h) => {
      const styled = applyHighlightStyleDefaults(h, opts.highlightStyle);
      return {
        selector: styled.selector,
        label: formatHighlightCaption(styled),
        duration: styled.duration,
        fastMode: styled.fastMode,
        tone: styled.tone,
        size: styled.size,
        weight: styled.weight,
        zoom: styled.zoom,
        zoomOut: styled.zoomOut,
        focus: !!styled.focus,
        color: styled.color,
        detail: styled.detail,
      };
    });
    await cycleHighlightRings(page, errHighlights, !!gatesFast, {
      defaultHoldMs: 2000,
      pace: demoPace,
      todos: errPhase.todos,
    });
  }
  await renderStepError(page, {
    index,
    total,
    blockName,
    message,
    allNames,
    allDescriptions,
    moduleIndex,
    allEpisodes,
    title,
    episodeNumber,
    episodeTitle,
    expectedFailureReason,
    stepperMode,
  });
  return gate();
}


/**
 * A Block threw - act()/observe() rejected, or Flow.run's own verify Trait
 * check failed. Shown instead of letting it crash the whole Node process
 * silently from a human's point of view (the browser closes right after
 * regardless - main()'s own try/finally - but not before this is visible).
 */
async function renderStepError(page: WgPage, info: any) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  const errorPayload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info: any) => {
      // Reused in place - see renderBeforeStep's own comment on this.
      let panel = __wgById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const isExpected = !!info.expectedFailureReason;
      const errClass = isExpected ? "wg-expected" : "wg-error";
      panel.classList.remove("wg-error", "wg-expected");
      panel.classList.add(errClass);
      if (!isNewPanel) panel.classList.add("wg-in");
      const episodes = info.allEpisodes && info.allEpisodes.length > 0
        ? __wgEl(
            "div",
            { id: "wg-episodes" },
            info.allEpisodes.map((e: any) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              return __wgEl("span", { class: "wg-ep-tab " + cls }, "Episode " + e.episodeNumber + ": " + (e.episodeTitle || ""));
            }),
          )
        : null;
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modules = info.allNames.map((name: any, idx: number) => {
        const cls = idx === info.moduleIndex ? "wg-mod-current" : idx < info.moduleIndex ? "wg-mod-done" : "wg-mod-upcoming";
        const desc = info.allDescriptions && info.allDescriptions[idx];
        return __wgEl("span", { class: "wg-mod " + cls, title: desc || undefined }, String(name));
      });
      const retryLabel = info.episodeNumber !== undefined ? "Retry Episode " + info.episodeNumber : "Retry";
      const headingText = isExpected
        ? "Expected outcome - Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " failed as intended"
        : "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " threw";
      __wgSet(
        panel,
        episodes,
        __wgEl("div", { id: "wg-modules", class: modulesClass }, modules),
        __wgEl("h3", { class: isExpected ? "wg-expected-heading" : "wg-error-heading" }, headingText),
        isExpected ? __wgEl("div", { class: "wg-expected-reason" }, String(info.expectedFailureReason)) : null,
        __wgEl("div", { class: "wg-error-msg" }, String(info.message)),
        __wgEl(
          "div",
          { class: "wg-error-actions" },
          __wgEl("button", { id: "wg-error-retry", class: "wg-error-retry" }, retryLabel),
          __wgEl("button", { id: "wg-run", class: "wg-error-stop" }, "Stop"),
        ),
      );
      if (isNewPanel) {
        __wgAdd(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
          fastForward: !!info.fastForward,
          isApi: !!info.isApi,
        });
      }
      if (window.__wgStampModal) {
        window.__wgStampModal(panel, "panel", {
          phase: "error",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const retryBtn = __wgById("wg-error-retry");
      if (retryBtn) retryBtn.addEventListener("click", () => window.__wgNext({ __wgRetry: "1" }));
    }, errorPayload)
    .catch(ignorePageGone);
}


/**
 * Recovers a DOM selector from a built-in Trait's own .name string -
 * visible(sel) / text-equals(sel, "...") - since Trait.check itself is
 * an opaque closure with no selector field of its own. Best-effort only: a
 * hand-written bespoke Trait, or url-matches(...) (no DOM target), yields
 * nothing to highlight, which is fine - the panel still shows the result.
 */
export function extractVerifyHighlights(block: any, resultTag: any) {
  let verify = block.instruction && block.instruction.verify;
  if (typeof verify === "function") {
    try {
      verify = verify({ __state: resultTag });
    } catch {
      verify = [];
    }
  }
  if (!Array.isArray(verify)) return [];
  const highlights = [];
  for (const t of verify) {
    const name = t && t.name;
    if (typeof name !== "string") continue;
    let m = /^visible\((.+)\)$/.exec(name);
    if (m) {
      highlights.push({ selector: m[1], label: name, tone: "auto" });
      continue;
    }
    m = /^text-equals\((.+?),\s*"/.exec(name);
    if (m) {
      highlights.push({ selector: m[1], label: name, tone: "auto" });
      continue;
    }
  }
  return highlights;
}
