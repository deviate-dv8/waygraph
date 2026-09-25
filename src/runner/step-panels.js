// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { installOverlay } from "./overlay-install.js";
import { join } from "node:path";
import { applyHighlightStyleDefaults, formatHighlightCaption, hasAuthoredStubOnError, normalizeHighlightTone, runStubPhase } from "../highlights.js";
import { cycleHighlightRings } from "./rings.js";

export async function renderBeforeStep(page, info) {
  await installOverlay(page, info.title);
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
    .catch(() => {});
  // miniStepLabel / todosHtmlFromInfo are Node-only — browser evaluate has no closure.
  const payload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      // Reused in place, not removed + recreated, every step - the old
      // remove()-then-fade-back-in cycle was a real flash on every single
      // transition (Dan: "the appear and disappear... hurts eyes and
      // dizzy"). Updating one persistent element's content has nothing to
      // flash - it only ever fades in ONCE, the first time this page
      // genuinely has no panel yet (a real navigation wiped the whole
      // document, or this is the very first step).
      let panel = document.getElementById("wg-panel");
      const isNewPanel = !panel;
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "wg-panel";
      }
      const pct = Math.round((info.index / info.total) * 100);
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      // A real tab bar, not a single text line - every episode this chain
      // touches, the current one reading as active (Dan: "if episode 1 is
      // active, the episode 2 tab is inactive"). Absent entirely for an ad
      // hoc block chain with no named Flows.
      const episodesHtml = info.allEpisodes && info.allEpisodes.length > 0
        ? "<div id=\"wg-episodes\">" +
          info.allEpisodes
            .map((e) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              // The gentle one-time glow only plays on the tab actually
              // being entered right now, not on every render of it.
              const enteredCls = info.justEnteredEpisode && e.episodeNumber === info.episodeNumber
                ? " wg-ep-entered"
                : "";
              return "<span class=\"wg-ep-tab " + cls + enteredCls + "\">Episode " + e.episodeNumber + ": " +
                esc(e.episodeTitle || "") + "</span>";
            })
            .join("") +
          "</div>"
        : "";
      // Scoped to THIS episode's own blocks (info.allNames is already the
      // episode-local subset the caller computed) - moduleIndex is this
      // step's position WITHIN that subset, not the whole chain's index -
      // "in episode 2 it shows 2nd to the last... it should start from the
      // first block" (Dan).
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx < info.moduleIndex ? "wg-mod-done" : idx === info.moduleIndex ? "wg-mod-current" : "wg-mod-upcoming";
          const desc = info.allDescriptions && info.allDescriptions[idx];
          const titleAttr = desc ? " title=\"" + esc(desc) + "\"" : "";
          return "<span class=\"wg-mod " + cls + "\"" + titleAttr + ">" + name + "</span>";
        })
        .join("");
      const narrationHtml = info.description
        ? "<div class=\"wg-narration\">" + esc(info.description) + "</div>"
        : "";
      const paceHtml =
        info.paceBadge || info.paceLabel
          ? "<div class=\"wg-pace\" data-pace-kind=\"" +
            esc(info.paceKind || "normal") +
            "\"><span class=\"wg-pace-badge\">" +
            esc(info.paceBadge || "1x") +
            "</span><span>" +
            esc(info.paceLabel || "") +
            "</span></div>"
          : "";
      // Todos render into floating #wg-todo-dock via __wgSyncTodos - never
      // inside .wg-body (would vanish under --mini / Hide collapse).
      let html =
        "<div id=\"wg-progress\"><div id=\"wg-progress-bar\" style=\"width:" + pct + "%\"></div></div>" +
        episodesHtml +
        paceHtml +
        "<div id=\"wg-modules\" class=\"" + modulesClass + "\">" + modulesHtml + "</div>" +
        "<h3>Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + "</h3>" +
        narrationHtml;
      if (info.keys.length === 0) {
        html += "<div class=\"wg-key\">(no MemKeys required)</div>";
      }
      for (const k of info.keys) {
        html +=
          "<div class=\"wg-key\"><label>" + k.name + "</label>" +
          "<textarea data-key=\"" + k.name + "\" rows=\"2\">" +
          k.value.replace(/</g, "&lt;") + "</textarea>" +
          "<div class=\"wg-key-pretty\" data-pretty-for=\"" + esc(k.name) + "\"></div>" +
          "</div>";
      }
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      html +=
        "<div class=\"wg-autoplay-row\"><label><input type=\"checkbox\" id=\"wg-autoplay-cb\"" +
        (autoNow ? " checked" : "") +
        "> Auto-advance</label></div>" +
        "<div id=\"wg-gate-manual\"" + (autoNow ? " style=\"display:none\"" : "") +
        "><button id=\"wg-run\">Run this step \u25B6</button></div>" +
        "<div id=\"wg-gate-auto\" class=\"wg-auto\"" + (autoNow ? "" : " style=\"display:none\"") +
        ">Auto-advancing...</div>";
      panel.innerHTML = html;
      if (isNewPanel) {
        document.documentElement.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
        });
      }
      if (window.__wgSyncTodos) {
        const sync = info.todoSync || (info.todos && info.todos.length ? "set" : "keep");
        // Prefer dock-only payload. Passing list:[] with a dock used to clear
        // marks a frame later (empty-list clear path).
        if (sync === "keep" && !info.todoDock) {
          /* leave floating dock alone */
        } else {
          const payload = {
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
      const prettyMemValue = (raw) => {
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return "<em>(invalid JSON)</em>";
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return esc(JSON.stringify(parsed));
        }
        return Object.entries(parsed)
          .map(([field, value]) => {
            const label = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
            return "<div class=\"wg-key-pretty-row\"><span class=\"wg-key-pretty-label\">" +
              esc(label) + ":</span> " + esc(String(value)) + "</div>";
          })
          .join("");
      };
      const applyKeyPretty = () => {
        const prettyOn = window.__wgPretty !== false;
        panel.querySelectorAll("textarea[data-key]").forEach((ta) => {
          const key = ta.getAttribute("data-key");
          const previewEl = panel.querySelector(".wg-key-pretty[data-pretty-for=\"" + key + "\"]");
          if (!previewEl) return;
          previewEl.style.display = prettyOn ? "" : "none";
          if (prettyOn) previewEl.innerHTML = prettyMemValue(ta.value);
        });
      };
      applyKeyPretty();
      panel.querySelectorAll("textarea[data-key]").forEach((ta) => {
        ta.addEventListener("input", applyKeyPretty);
      });
      const runBtn = document.getElementById("wg-run");
      if (runBtn) {
        runBtn.addEventListener("click", () => {
          const edits = {};
          panel.querySelectorAll("textarea[data-key]").forEach((el) => {
            edits[el.getAttribute("data-key")] = el.value;
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
      const cb = document.getElementById("wg-autoplay-cb");
      if (cb) {
        cb.addEventListener("change", () => {
          try {
            localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
          } catch {
            /* private mode / blocked storage - toggle still works this page */
          }
          const manual = document.getElementById("wg-gate-manual");
          const auto = document.getElementById("wg-gate-auto");
          if (manual) manual.style.display = cb.checked ? "none" : "";
          if (auto) auto.style.display = cb.checked ? "" : "none";
        });
      }
    }, payload)
    .catch(() => {});
  if (process.env.WAYGRAPH_PROVE_SHOT || process.env.WAYGRAPH_PROVE_EXIT === "1") {
    // Default: prove once on first painted panel. PROVE_EVERY=1 re-checks
    // every step (noisy; useful when hunting a mid-chain blank).
    const proveEvery = process.env.WAYGRAPH_PROVE_EVERY === "1";
    const already = globalThis.__wgProveDone;
    if (!already || proveEvery || process.env.WAYGRAPH_PROVE_EXIT === "1") {
      await page.waitForTimeout(500).catch(() => {});
      if (process.env.WAYGRAPH_PROVE_SHOT) {
        await page.screenshot({ path: process.env.WAYGRAPH_PROVE_SHOT }).catch(() => {});
      }
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
            hasRun: !!document.getElementById("wg-run"),
            readyAttr: document.getElementById("wg-panel")?.getAttribute("data-wg-ready") || null,
          };
        })
        .catch((e) => ({ ok: false, reason: String(e && e.message ? e.message : e) }));
      console.error("WAYGRAPH_PROVE " + JSON.stringify(ok));
      globalThis.__wgProveDone = true;
      if (process.env.WAYGRAPH_PROVE_EXIT === "1") {
        process.exit(ok && ok.ok ? 0 : 2);
      }
    }
  }
}


function miniStepLabel(info) {
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
 * for Stop/Retry. Used when a step throws OR when withExpectedFailure's last
 * block succeeds on the intentional fail branch (e.g. LoginPage + error banner).
 */
export async function presentFailPanel(page, opts) {
  const {
    block,
    fixtures,
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
  if (hasAuthoredStubOnError(block, fixtures)) {
    await page
      .evaluate(() => {
        if (window.__wgRingTrack) {
          window.removeEventListener("resize", window.__wgRingTrack);
          window.removeEventListener("scroll", window.__wgRingTrack, true);
          window.__wgRingTrack = null;
        }
      })
      .catch(() => {});
    const errPhase = await runStubPhase(block, "stubOnError", {
      fixtures,
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
        tone: styled.tone,
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


export async function renderAfterStep(page, info) {
  await installOverlay(page, info.title);
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
    .catch(() => {});
  const highlights = info.highlights || [];
  const gatesFast = !!info.gatesFast;
  // Cycle through EVERY declared/recovered highlight in order, each shown
  // long enough to actually register - "it highlights something [...] then
  // it highlights something [else] and next," not just the first one.
  // duration / fastMode on stubAfter (or flow fixtures) override the legacy
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
    .evaluate((info) => {
      // Reused in place - see renderBeforeStep's own comment on this.
      let panel = document.getElementById("wg-panel");
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
      const escA = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx <= info.moduleIndex ? "wg-mod-done" : "wg-mod-upcoming";
          const desc = info.allDescriptions && info.allDescriptions[idx];
          const titleAttr = desc ? " title=\"" + escA(desc) + "\"" : "";
          return "<span class=\"wg-mod " + cls + "\"" + titleAttr + ">" + name + "</span>";
        })
        .join("");
      // QA-friendly by default ("LoginSuccess" -> "Login Success") - raw
      // JSON is one click away for whoever actually wants __state.
      const stateTag = info.result && info.result.__state ? info.result.__state : "";
      const prettyText = stateTag
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") || info.resultTag;
      const pretty = window.__wgPretty !== false;
      const resultHtml =
        "<div class=\"wg-toggle\">" +
        "<button class=\"wg-toggle-btn" + (pretty ? " wg-active" : "") + "\" data-mode=\"pretty\">Pretty</button>" +
        "<button class=\"wg-toggle-btn" + (pretty ? "" : " wg-active") + "\" data-mode=\"json\">JSON</button>" +
        "</div>" +
        "<div class=\"wg-result wg-result-pretty\" style=\"display:" + (pretty ? "block" : "none") + "\">" +
        prettyText + "</div>" +
        "<div class=\"wg-result wg-result-json\" style=\"display:" + (pretty ? "none" : "block") + "\">" +
        info.resultTag + "</div>";
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      const gateHtml =
        "<div class=\"wg-autoplay-row\"><label><input type=\"checkbox\" id=\"wg-autoplay-cb\"" +
        (autoNow ? " checked" : "") +
        "> Auto-advance</label></div>" +
        "<div id=\"wg-gate-manual\"" + (autoNow ? " style=\"display:none\"" : "") +
        "><button id=\"wg-run\">" + buttonLabel + "</button></div>" +
        "<div id=\"wg-gate-auto\" class=\"wg-auto\"" + (autoNow ? "" : " style=\"display:none\"") +
        ">Auto-advancing...</div>";
      const episodesHtml = info.allEpisodes && info.allEpisodes.length > 0
        ? "<div id=\"wg-episodes\">" +
          info.allEpisodes
            .map((e) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              return "<span class=\"wg-ep-tab " + cls + "\">Episode " + e.episodeNumber + ": " +
                escA(e.episodeTitle || "") + "</span>";
            })
            .join("") +
          "</div>"
        : "";
      const paceHtml =
        info.paceBadge || info.paceLabel
          ? "<div class=\"wg-pace\" data-pace-kind=\"" +
            escA(info.paceKind || "normal") +
            "\"><span class=\"wg-pace-badge\">" +
            escA(info.paceBadge || "1x") +
            "</span><span>" +
            escA(info.paceLabel || "") +
            "</span></div>"
          : "";
      const todosHtml = ""; // todos float in #wg-todo-dock via __wgSyncTodos
      panel.innerHTML =
        "<div id=\"wg-progress\"><div id=\"wg-progress-bar\" style=\"width:" + pct + "%\"></div></div>" +
        episodesHtml +
        paceHtml +
        "<div id=\"wg-modules\" class=\"" + modulesClass + "\">" + modulesHtml + "</div>" +
        "<h3>" + heading + "</h3>" +
        todosHtml +
        resultHtml +
        gateHtml;
      if (isNewPanel) {
        document.documentElement.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
        });
      }
      if (window.__wgSyncTodos) {
        const sync = info.todoSync || (info.todos && info.todos.length ? "set" : "keep");
        // Prefer dock-only payload. Passing list:[] with a dock used to clear
        // marks a frame later (empty-list clear path).
        if (sync === "keep" && !info.todoDock) {
          /* leave floating dock alone */
        } else {
          const payload = {
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
      panel.querySelectorAll(".wg-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const wantPretty = btn.getAttribute("data-mode") === "pretty";
          window.__wgPretty = wantPretty;
          panel.querySelectorAll(".wg-toggle-btn").forEach((b) => b.classList.remove("wg-active"));
          btn.classList.add("wg-active");
          panel.querySelector(".wg-result-pretty").style.display = wantPretty ? "block" : "none";
          panel.querySelector(".wg-result-json").style.display = wantPretty ? "none" : "block";
        });
      });
      const runBtn = document.getElementById("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const cb = document.getElementById("wg-autoplay-cb");
      if (cb) {
        cb.addEventListener("change", () => {
          try {
            localStorage.setItem("wg-autoplay", cb.checked ? "1" : "0");
          } catch {
            /* private mode / blocked storage - toggle still works this page */
          }
          const manual = document.getElementById("wg-gate-manual");
          const auto = document.getElementById("wg-gate-auto");
          if (manual) manual.style.display = cb.checked ? "none" : "";
          if (auto) auto.style.display = cb.checked ? "" : "none";
        });
      }
    }, afterPayload)
    .catch(() => {});
}


/**
 * A Block threw - act()/observe() rejected, or Flow.run's own verify Trait
 * check failed. Shown instead of letting it crash the whole Node process
 * silently from a human's point of view (the browser closes right after
 * regardless - main()'s own try/finally - but not before this is visible).
 */
async function renderStepError(page, info) {
  await installOverlay(page, info.title);
  const errorPayload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      // Reused in place - see renderBeforeStep's own comment on this.
      let panel = document.getElementById("wg-panel");
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
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const episodesHtml = info.allEpisodes && info.allEpisodes.length > 0
        ? "<div id=\"wg-episodes\">" +
          info.allEpisodes
            .map((e) => {
              const cls = e.episodeNumber < info.episodeNumber ? "wg-ep-done"
                : e.episodeNumber === info.episodeNumber ? "wg-ep-current"
                : "wg-ep-upcoming";
              return "<span class=\"wg-ep-tab " + cls + "\">Episode " + e.episodeNumber + ": " +
                esc(e.episodeTitle || "") + "</span>";
            })
            .join("") +
          "</div>"
        : "";
      const modulesClass = info.stepperMode === "full" ? "wg-modules-full" : "wg-modules-carousel";
      const modulesHtml = info.allNames
        .map((name, idx) => {
          const cls = idx === info.moduleIndex ? "wg-mod-current" : idx < info.moduleIndex ? "wg-mod-done" : "wg-mod-upcoming";
          const desc = info.allDescriptions && info.allDescriptions[idx];
          const titleAttr = desc ? " title=\"" + esc(desc) + "\"" : "";
          return "<span class=\"wg-mod " + cls + "\"" + titleAttr + ">" + name + "</span>";
        })
        .join("");
      const retryLabel = info.episodeNumber !== undefined ? "Retry Episode " + info.episodeNumber : "Retry";
      const headingText = isExpected
        ? "Expected outcome - Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " failed as intended"
        : "Step " + (info.index + 1) + " / " + info.total + " - " + info.blockName + " threw";
      const reasonHtml = isExpected
        ? "<div class=\"wg-expected-reason\">" + esc(info.expectedFailureReason) + "</div>"
        : "";
      panel.innerHTML =
        episodesHtml +
        "<div id=\"wg-modules\" class=\"" + modulesClass + "\">" + modulesHtml + "</div>" +
        "<h3 class=\"" + (isExpected ? "wg-expected-heading" : "wg-error-heading") + "\">" + headingText + "</h3>" +
        reasonHtml +
        "<div class=\"wg-error-msg\">" + esc(info.message) + "</div>" +
        "<div class=\"wg-error-actions\">" +
        "<button id=\"wg-error-retry\" class=\"wg-error-retry\">" + esc(retryLabel) + "</button>" +
        "<button id=\"wg-run\" class=\"wg-error-stop\">Stop</button>" +
        "</div>";
      if (isNewPanel) {
        document.documentElement.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add("wg-in"));
      } else {
        panel.classList.add("wg-in");
      }
      if (window.__wgWirePanelChrome) {
        window.__wgWirePanelChrome(panel, "wg-panel-hidden", "waygraph demo", {
          stepLabel: info.stepLabel || "",
          forceCollapsed: info.forceCollapsed === true ? true : undefined,
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
      const runBtn = document.getElementById("wg-run");
      if (runBtn) runBtn.addEventListener("click", () => window.__wgNext({}));
      const retryBtn = document.getElementById("wg-error-retry");
      if (retryBtn) retryBtn.addEventListener("click", () => window.__wgNext({ __wgRetry: "1" }));
    }, errorPayload)
    .catch(() => {});
}


/**
 * A Block's own explicit instruction.highlights, if it declared any -
 * arbitrary, author-controlled highlight points, independent of verify
 * ("remember this ID" isn't a pass/fail check). Takes priority over
 * anything recovered from verify traits below.
 */
function resolveDeclaredHighlights(block, resultTag) {
  let highlights = block.instruction && block.instruction.highlights;
  if (typeof highlights === "function") {
    try {
      highlights = highlights({ __state: resultTag });
    } catch {
      highlights = [];
    }
  }
  if (!Array.isArray(highlights)) return [];
  return highlights.filter((h) => h && typeof h.selector === "string" && typeof h.label === "string").map((h) => ({
    ...h,
    tone: normalizeHighlightTone(h.tone),
  }));
}


/**
 * Recovers a DOM selector from a built-in Trait's own .name string -
 * visible(sel) / text-equals(sel, "...") - since Trait.check itself is
 * an opaque closure with no selector field of its own. Best-effort only: a
 * hand-written bespoke Trait, or url-matches(...) (no DOM target), yields
 * nothing to highlight, which is fine - the panel still shows the result.
 * Only used as a FALLBACK when the Block declared no explicit
 * instruction.highlights of its own - see resolveDeclaredHighlights.
 */
export function extractVerifyHighlights(block, resultTag) {
  const declared = resolveDeclaredHighlights(block, resultTag);
  if (declared.length > 0) return declared;
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
