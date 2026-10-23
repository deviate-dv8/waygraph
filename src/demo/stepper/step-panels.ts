// The stepper's panels: before a step (what will happen, its mem), after it (the result and rings), and on failure.
import type { WgPage } from "../types.js";
import { installOverlay } from "../overlay/overlay.js";
import { applyHighlightStyleDefaults, formatHighlightCaption } from "../narration/style.js";
import { hasAuthoredStubOnError, runStubPhase } from "../narration/narration.js";
import { cycleHighlightRings } from "../overlay/rings.js";
import { envFlag, envString } from "../../engine/env.js";
import { ignorePageGone, ignoreTimeout } from "../../engine/page-gone.js";

export async function renderBeforeStep(page: WgPage, info: any) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  // A ring left highlighting the PREVIOUS step's element (and its live
  // resize/scroll tracker) shouldn't linger once a new step's own panel is
  // up - only relevant when a Block's act() doesn't navigate away, since a
  // real navigation already wipes document.documentElement's children.
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
      if (window.__wgHideRing) window.__wgHideRing();
      if (window.__wgHideCursor) window.__wgHideCursor();
    })
    .catch(ignorePageGone);
  // miniStepLabel / todosHtmlFromInfo are Node-only — browser evaluate has no closure.
  const payload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info: any) => {
      // Reused in place, not removed + recreated, every step - the old
      // remove()-then-fade-back-in cycle was a real flash on every single
      // transition (the user: "the appear and disappear... hurts eyes and
      // dizzy"). Updating one persistent element's content has nothing to
      // flash - it only ever fades in ONCE, the first time this page
      // genuinely has no panel yet (a real navigation wiped the whole
      // document, or this is the very first step).
      let panel = __wgById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const pct = Math.round((info.index / info.total) * 100);
      // A real tab bar, not a single text line - every episode this chain
      // touches, the current one reading as active (the user: "if episode 1 is
      // active, the episode 2 tab is inactive"). Absent entirely for an ad
      // hoc block chain with no named Flows.
      const episodes = info.allEpisodes && info.allEpisodes.length > 0
        ? __wgEl(
            "div",
            { id: "wg-episodes" },
            info.allEpisodes.map((e: any) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              // The gentle one-time glow only plays on the tab actually
              // being entered right now, not on every render of it.
              const enteredCls = info.justEnteredEpisode && e.episodeNumber === info.episodeNumber
                ? " wg-ep-entered"
                : "";
              return __wgEl("span", { class: "wg-ep-tab " + cls + enteredCls }, "Episode " + e.episodeNumber + ": " + (e.episodeTitle || ""));
            }),
          )
        : null;
      // Scoped to THIS episode's own blocks (info.allNames is already the
      // episode-local subset the caller computed) - moduleIndex is this
      // step's position WITHIN that subset, not the whole chain's index -
      // "in episode 2 it shows 2nd to the last... it should start from the
      // first block" (the user).
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modules = info.allNames.map((name: any, idx: number) => {
        const cls = idx < info.moduleIndex ? "wg-mod-done" : idx === info.moduleIndex ? "wg-mod-current" : "wg-mod-upcoming";
        const desc = info.allDescriptions && info.allDescriptions[idx];
        return __wgEl("span", { class: "wg-mod " + cls, title: desc || undefined }, String(name));
      });
      const pace =
        info.paceBadge || info.paceLabel
          ? __wgEl(
              "div",
              { class: "wg-pace", data: { paceKind: info.paceKind || "normal" } },
              __wgEl("span", { class: "wg-pace-badge" }, info.paceBadge || "1x"),
              __wgEl("span", null, info.paceLabel || ""),
            )
          : null;
      const keys = info.keys.length === 0
        ? [__wgEl("div", { class: "wg-key" }, "(no MemKeys required)")]
        : info.keys.map((k: any) => {
            const field = __wgEl("textarea", { data: { key: k.name }, attrs: { rows: 2 } });
            field.value = k.value;
            return __wgEl("div", { class: "wg-key" }, __wgEl("label", null, k.name), field, __wgEl("div", { class: "wg-key-pretty", data: { prettyFor: k.name } }));
          });
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      const autoplay = __wgEl("input", { id: "wg-autoplay-cb", attrs: { type: "checkbox" } });
      autoplay.checked = autoNow;
      // Todos render into floating #wg-todo-dock via __wgSyncTodos - never
      // inside .wg-body (would vanish under --mini / Hide collapse).
      __wgSet(
        panel,
        __wgEl("div", { id: "wg-progress" }, __wgEl("div", { id: "wg-progress-bar", style: "width:" + pct + "%" })),
        episodes,
        pace,
        __wgEl("div", { id: "wg-modules", class: modulesClass }, modules),
        __wgEl("h3", null, "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName),
        info.description ? __wgEl("div", { class: "wg-narration" }, info.description) : null,
        keys,
        __wgEl("div", { class: "wg-autoplay-row" }, __wgEl("label", null, autoplay, " Auto-advance")),
        __wgEl("div", { id: "wg-gate-manual", style: autoNow ? "display:none" : "" }, __wgEl("button", { id: "wg-run" }, "Run this step \u25B6")),
        __wgEl("div", { id: "wg-gate-auto", class: "wg-auto", style: autoNow ? "" : "display:none" }, "Auto-advancing..."),
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
      if (window.__wgSyncTodos) {
        const sync = info.todoSync || (info.todos && info.todos.length ? "set" : "keep");
        // Prefer dock-only payload. Passing list:[] with a dock used to clear
        // marks a frame later (empty-list clear path).
        if (sync === "keep" && !info.todoDock) {
          /* leave floating dock alone */
        } else {
          const payload: Record<string, any> = {
            sync: sync,
            dock: info.todoDock || null,
            pos: info.todoPos || null,
            todoId: info.todoId || (info.todoDock && info.todoDock.id) || null,
          };
          if (!info.todoDock && info.todos && info.todos.length) {
            payload.list = info.todos;
          }
          window.__wgSyncTodos(payload);
        }
      }
      if (window.__wgStampModal) {
        window.__wgStampModal(panel, "panel", {
          phase: "before",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      // Live, human-readable preview of what a MemKey's raw JSON will
      // actually write - object fields become "Field: value" lines
      // (camelCase split the same way state tags already are); a
      // non-object payload (a plain string/number/array) is shown as-is.
      // Hidden entirely in JSON mode - shares the SAME global toggle the
      // result display's own Pretty/JSON buttons already set, not a
      // second, separate preference.
      const prettyMemValue = (raw: any): WgChild[] => {
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return [__wgEl("em", null, "(invalid JSON)")];
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return [JSON.stringify(parsed)];
        }
        return Object.entries(parsed).map(([field, value]) => {
          const label = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
          return __wgEl("div", { class: "wg-key-pretty-row" }, __wgEl("span", { class: "wg-key-pretty-label" }, label + ":"), " " + String(value));
        });
      };
      const applyKeyPretty = () => {
        const prettyOn = window.__wgPretty !== false;
        panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((ta) => {
          const previewEl = ta.parentElement?.querySelector<HTMLElement>(".wg-key-pretty");
          if (!previewEl) return;
          previewEl.style.display = prettyOn ? "" : "none";
          if (prettyOn) __wgSet(previewEl, prettyMemValue(ta.value));
        });
      };
      applyKeyPretty();
      panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((ta) => {
        ta.addEventListener("input", applyKeyPretty);
      });
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) {
        runBtn.addEventListener("click", () => {
          const edits: Record<string, any> = {};
          panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((el) => {
            edits[el.getAttribute("data-key") ?? ""] = el.value;
          });
          window.__wgNext(edits);
        });
      }
      // Live toggle - flips localStorage immediately so an in-flight gate()
      // poll (on the Node side) picks it up within its next poll slice,
      // without needing this whole panel to re-render. A manual click
      // still always wins over an active autoplay wait, whichever the
      // checkbox says - this is the "hybrid" control: autoplay is a
      // default, not a lockout.
      const cb = __wgById<HTMLInputElement>("wg-autoplay-cb");
      if (cb) {
        cb.addEventListener("change", () => {
          try {
            localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
          } catch {
            /* private mode / blocked storage - toggle still works this page */
          }
          const manual = __wgById("wg-gate-manual");
          const auto = __wgById("wg-gate-auto");
          if (manual) manual.style.display = cb.checked ? "none" : "";
          if (auto) auto.style.display = cb.checked ? "" : "none";
        });
      }
    }, payload)
    .catch(ignorePageGone);
  if (envString("WAYGRAPH_PROVE_SHOT") || envFlag("WAYGRAPH_PROVE_EXIT")) {
    // Default: prove once on first painted panel. PROVE_EVERY=1 re-checks
    // every step (noisy; useful when hunting a mid-chain blank).
    const proveEvery = envFlag("WAYGRAPH_PROVE_EVERY");
    const already = (globalThis as { __wgProveDone?: boolean }).__wgProveDone;
    if (!already || proveEvery || envFlag("WAYGRAPH_PROVE_EXIT")) {
      await page.waitForTimeout(500).catch(ignoreTimeout);
      const shot = envString("WAYGRAPH_PROVE_SHOT");
      if (shot) await page.screenshot({ path: shot }).catch(ignorePageGone);
      const ok = await page
        .evaluate(() => {
          const beacons =
            typeof window.__wgOverlayBeacon === "function" ? window.__wgOverlayBeacon() : [];
          const panel = beacons.find((b) => b.modal === "panel" && b.ready && b.visible);
          const textOk = panel && panel.textLen >= 12;
          const opacityOk = panel && Number(panel.opacity) > 0.5;
          return {
            ok: !!(panel && textOk && opacityOk),
            beacons,
            hasRun: !!__wgById<HTMLButtonElement>("wg-run"),
            readyAttr: __wgById("wg-panel")?.getAttribute("data-wg-ready") || null,
          };
        })
        .catch((e: any) => ({ ok: false, reason: String(e instanceof Error ? e.message : e) }));
      console.error("WAYGRAPH_PROVE " + JSON.stringify(ok));
      (globalThis as { __wgProveDone?: boolean }).__wgProveDone = true;
      if (envFlag("WAYGRAPH_PROVE_EXIT")) {
        process.exit(ok && ok.ok ? 0 : 2);
      }
    }
  }
}


function miniStepLabel(info: any) {
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


export async function renderAfterStep(page: WgPage, info: any) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  // Clear any tracker from a previous highlight before cycling through this
  // step's own.
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
    })
    .catch(ignorePageGone);
  const highlights = info.highlights || [];
  const gatesFast = !!info.gatesFast;
  // Cycle through EVERY declared/recovered highlight in order, each shown
  // long enough to actually register - "it highlights something [...] then
  // it highlights something [else] and next," not just the first one.
  // duration / fastMode on stubAfter (or flow fixtures) override the default
  // 900ms / 200ms holds when set.
  await cycleHighlightRings(page, highlights, gatesFast, {
    pace: info.pace,
    stepLabel: miniStepLabel(info),
    todoDock: info.todoDock,
    todos: info.todos,
    todoSync: info.todoSync,
    todoDockRef: info.todoDockRef,
    // stubAfter already authored progress - do not re-index by ring 0..n
    advanceTodos: false,
  });
  // After-ring advances may have moved the dock - surface latest for caller.
  if (info.todoDockRef && info.todoDockRef.current) {
    info.todoDock = info.todoDockRef.current;
  }
  const afterPayload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info: any) => {
      // Reused in place - see renderBeforeStep's own comment on this.
      let panel = __wgById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const pct = Math.round(((info.index + 1) / info.total) * 100);
      const heading = info.isLast
        ? "End of chain - " + info.total + " / " + info.total + " blocks covered - " + info.blockName + " done"
        : "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " done";
      const buttonLabel = info.isLast ? "Finish" : "Next \u25B6";
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modules = info.allNames.map((name: any, idx: number) => {
        const cls = idx <= info.moduleIndex ? "wg-mod-done" : "wg-mod-upcoming";
        const desc = info.allDescriptions && info.allDescriptions[idx];
        return __wgEl("span", { class: "wg-mod " + cls, title: desc || undefined }, String(name));
      });
      // QA-friendly by default ("LoginSuccess" -> "Login Success") - raw
      // JSON is one click away for whoever actually wants __state.
      const stateTag = info.result && info.result.__state ? info.result.__state : "";
      const prettyText = stateTag
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") || info.resultTag;
      const pretty = window.__wgPretty !== false;
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      const autoplay = __wgEl("input", { id: "wg-autoplay-cb", attrs: { type: "checkbox" } });
      autoplay.checked = autoNow;
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
      const pace =
        info.paceBadge || info.paceLabel
          ? __wgEl(
              "div",
              { class: "wg-pace", data: { paceKind: info.paceKind || "normal" } },
              __wgEl("span", { class: "wg-pace-badge" }, info.paceBadge || "1x"),
              __wgEl("span", null, info.paceLabel || ""),
            )
          : null;
      // Todos float in #wg-todo-dock via __wgSyncTodos, never in the panel.
      __wgSet(
        panel,
        __wgEl("div", { id: "wg-progress" }, __wgEl("div", { id: "wg-progress-bar", style: "width:" + pct + "%" })),
        episodes,
        pace,
        __wgEl("div", { id: "wg-modules", class: modulesClass }, modules),
        __wgEl("h3", null, heading),
        __wgEl(
          "div",
          { class: "wg-toggle" },
          __wgEl("button", { class: "wg-toggle-btn" + (pretty ? " wg-active" : ""), data: { mode: "pretty" } }, "Pretty"),
          __wgEl("button", { class: "wg-toggle-btn" + (pretty ? "" : " wg-active"), data: { mode: "json" } }, "JSON"),
        ),
        __wgEl("div", { class: "wg-result wg-result-pretty", style: "display:" + (pretty ? "block" : "none") }, String(prettyText)),
        __wgEl("div", { class: "wg-result wg-result-json", style: "display:" + (pretty ? "none" : "block") }, String(info.resultTag)),
        __wgEl("div", { class: "wg-autoplay-row" }, __wgEl("label", null, autoplay, " Auto-advance")),
        __wgEl("div", { id: "wg-gate-manual", style: autoNow ? "display:none" : "" }, __wgEl("button", { id: "wg-run" }, buttonLabel)),
        __wgEl("div", { id: "wg-gate-auto", class: "wg-auto", style: autoNow ? "" : "display:none" }, "Auto-advancing..."),
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
      if (window.__wgSyncTodos) {
        const sync = info.todoSync || (info.todos && info.todos.length ? "set" : "keep");
        // Prefer dock-only payload. Passing list:[] with a dock used to clear
        // marks a frame later (empty-list clear path).
        if (sync === "keep" && !info.todoDock) {
          /* leave floating dock alone */
        } else {
          const payload: Record<string, any> = {
            sync: sync,
            dock: info.todoDock || null,
            pos: info.todoPos || null,
            todoId: info.todoId || (info.todoDock && info.todoDock.id) || null,
          };
          if (!info.todoDock && info.todos && info.todos.length) {
            payload.list = info.todos;
          }
          window.__wgSyncTodos(payload);
        }
      }
      if (window.__wgStampModal) {
        window.__wgStampModal(panel, "panel", {
          phase: "after",
          step: info.index + 1,
          total: info.total,
          block: info.blockName || "",
          ready: true,
        });
      }
      panel.querySelectorAll<HTMLElement>(".wg-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wantPretty = btn.getAttribute("data-mode") === "pretty";
          window.__wgPretty = wantPretty;
          panel.querySelectorAll<HTMLElement>(".wg-toggle-btn").forEach((b) => b.classList.remove("wg-active"));
          btn.classList.add("wg-active");
          panel.querySelector<HTMLElement>(".wg-result-pretty")!.style.display = wantPretty ? "block" : "none";
          panel.querySelector<HTMLElement>(".wg-result-json")!.style.display = wantPretty ? "none" : "block";
        });
      });
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const cb = __wgById<HTMLInputElement>("wg-autoplay-cb");
      if (cb) {
        cb.addEventListener("change", () => {
          try {
            localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
          } catch {
            /* private mode / blocked storage - toggle still works this page */
          }
          const manual = __wgById("wg-gate-manual");
          const auto = __wgById("wg-gate-auto");
          if (manual) manual.style.display = cb.checked ? "none" : "";
          if (auto) auto.style.display = cb.checked ? "" : "none";
        });
      }
    }, afterPayload)
    .catch(ignorePageGone);
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
