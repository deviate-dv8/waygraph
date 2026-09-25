// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { instrumentInteractionHighlighting } from "./interaction-patch.js";
import { applyDevicePhase, applyHighlightStyleDefaults, applyTodoPhase, demoPaceGateMs, demoPaceIsBlitz, demoPaceIsFast, demoPaceIsSlow, formatHighlightCaption, hasAuthoredStubAfter, resolveSlides, resolveStepDemoPace, resolveTodoDockUi, runStubPhase } from "../highlights.js";
import { markStepRunning, resetPageState, teardownOverlay } from "./teardown.js";
import { demoLog, logStubPhaseFixtures, logTodoDockFull, paceSpeakFields, summarizeDevice } from "./demo-log.js";
import { applyDeviceToPage } from "./device-stage.js";
import { extractVerifyHighlights, presentFailPanel, renderAfterStep, renderBeforeStep } from "./step-panels.js";
import { probeTodoDocksOnPage } from "./todo-dock.js";
import { join } from "node:path";
import { presentSlides } from "./slides.js";

export async function runStepMode(engine, start, end, context, page, mem, resolved, slowMo, title, fastBlockNames, clearSession, baseURL) {
  // A shared, mutable pacing knob the interaction patches read live (per
  // call, not once at setup) - flipped per-block below so one block (e.g.
  // WAYGRAPH_FAST_BLOCKS=login or an FFCompose unit) can run through with
  // none of the overlay's own added dwell while the rest of the chain keeps
  // the full theatrical pace.
  // --fast / WAYGRAPH_DEMO_FAST: shorter auto-next / Next gates ONLY -
  // keeps smooth cursor travel (not akin to waygraph run).
  // FFCompose + WAYGRAPH_FAST_BLOCKS: skipTheater (blitz overlay delays).
  // When the flow has any opaque FF unit and WAYGRAPH_SLOWMO is unset,
  // launch slowMo is 0 so Playwright itself does not re-tax every click
  // inside the FF (that was the "30s login / cursor gone but still slow" bug).
  const demoFast = process.env.WAYGRAPH_DEMO_FAST === "1";
  const stepperMode = process.env.WAYGRAPH_STEPPER === "full" ? "full" : "carousel";
  const pacing = { gatesFast: demoFast, gatesSlow: false, skipTheater: false, demoPace: "normal" };
  const stubBeforeRef = { current: [] };
  /** Live todo dock for Method fill/click advance (same carry as lastTodoDock). */
  const todoDockRef = { current: undefined };
  /** Live device fixture for touch theater (same carry as lastDevice). */
  const deviceRef = { current: undefined };
  instrumentInteractionHighlighting(page, mem, slowMo, pacing, stubBeforeRef, todoDockRef, deviceRef);
  // Force the panel checkbox from this process's flags/env at run start.
  // installOverlay only seeds localStorage when the key is null (so mid-run
  // checkbox clicks survive navigations). Without this, a prior --autoplay
  // session sticks forever and agents cannot flip back with --no-autoplay.
  // Must run on the *demo origin* (after goto), not about:blank - localStorage
  // is origin-scoped.
  const syncAutoplayFromEnv = async () => {
    if (process.env.WAYGRAPH_AUTOPLAY === undefined) return;
    const on = process.env.WAYGRAPH_AUTOPLAY === "1";
    await page
      .evaluate((want) => {
        try {
          localStorage.setItem("wg-autoplay", want ? "1" : "0");
        } catch {
          /* private mode / blocked storage */
        }
      }, on)
      .catch(() => {});
  };
  await syncAutoplayFromEnv();
  // Some real Blocks (e.g. zsign-all's login.block.ts) call
  // page.setViewportSize({ width: 1280, height: 720 }) inside their own
  // act() - a hardcoded override for THEIR OWN testing consistency, with no
  // idea an interactive human session is watching. Restoring the size
  // AFTER each step (the first attempt at this) was still just repairing
  // damage after the fact, on a delay, per-step - not the real fix. The
  // real fix is to stop the override from ever landing at all: no-op
  // setViewportSize entirely for the duration of step mode. Blocks that
  // call it don't need it to actually do anything here - their own
  // selectors/layouts still work fine at whatever size the real window
  // already is. Authored ctx.device() still uses __wgRealSetViewportSize.
  page.__wgRealSetViewportSize = page.setViewportSize.bind(page);
  page.setViewportSize = async () => {};
  let resolveNext = null;
  // Render-to-gate race: a slide/step panel's Next button is wired to
  // window.__wgNext BEFORE gate() calls waitForNext() (there is at least
  // one more await - the autoplay-sync evaluate - in between on the
  // presentSlides path). A click landing in that small window used to be
  // dropped silently (resolveNext was still null) - the panel then looked
  // "stuck" forever since gate() started listening AFTER the click already
  // fired and no second click ever came. Queue it instead: the very next
  // waitForNext() call picks up a pending click immediately.
  let pendingNext = null;
  await page.exposeFunction("__wgNext", (edits) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(edits);
    } else {
      pendingNext = edits;
    }
  });
  const waitForNext = () =>
    new Promise((res) => {
      if (pendingNext !== null) {
        const edits = pendingNext;
        pendingNext = null;
        res(edits);
        return;
      }
      resolveNext = res;
    });
  // WAYGRAPH_AUTOPLAY=1 only sets the STARTING checkbox state now - the
  // panel's own "Auto-advance" checkbox can flip it live, mid-run, and a
  // manual click always wins over an in-flight autoplay wait regardless of
  // which way the checkbox is set. That's the hybrid Dan asked for: some
  // steps auto-advance, some get a manual click, toggled as the demo goes,
  // not fixed for the whole run from a single env var.
  const autoplayMs = process.env.WAYGRAPH_AUTOPLAY_MS
    ? Number(process.env.WAYGRAPH_AUTOPLAY_MS)
    : demoFast
      ? 450
      : 1800;
  const currentAutoplay = () =>
    page
      .evaluate(() => {
        try {
          return localStorage.getItem("wg-autoplay") === "1";
        } catch {
          return false;
        }
      })
      .catch(() => false);
  const gate = async () => {
    const next = waitForNext();
    // WAYGRAPH_FAST_BLOCKS names a block that should blow past its own
    // gates too, not just skip its interaction dwell - otherwise autoplay
    // still stalls the full autoplayMs admiring a step that intentionally
    // ran too fast to watch.
    const ms = demoPaceGateMs(
      pacing.skipTheater ? "blitz" : pacing.demoPace,
      autoplayMs,
    );
    let elapsed = 0;
    for (;;) {
      // Re-read the checkbox EVERY loop tick, not once up front - a human
      // starting a step in manual mode and then checking "Auto-advance"
      // mid-wait must actually start counting down from that moment, not
      // get stuck on whatever mode was live when gate() was first called.
      const auto = await currentAutoplay();
      const slice = auto
        ? Math.min(250, Math.max(50, ms - elapsed))
        : 250; // manual: just a cheap poll tick, waiting on either a click or the box getting checked
      const winner = await Promise.race([
        next.then((edits) => ({ clicked: true, edits })),
        new Promise((res) => setTimeout(() => res({ clicked: false }), slice)),
      ]);
      if (winner.clicked) return winner.edits;
      if (!auto) continue;
      elapsed += slice;
      if (elapsed >= ms) return {};
    }
  };
  const allNames = resolved.map((r) => r.block.name);
  const allDescriptions = resolved.map((r) => r.block.description || "");
  // Deduped, in-order list of every real episode this chain touches - for
  // the episode tab bar. Ad hoc block segments (no named Flow) carry no
  // episodeNumber and never appear here, same gate the "Episode N:"
  // heading already used.
  const allEpisodes = [];
  for (const r of resolved) {
    if (r.episodeNumber && !allEpisodes.some((e) => e.episodeNumber === r.episodeNumber)) {
      allEpisodes.push({ episodeNumber: r.episodeNumber, episodeTitle: r.episodeTitle });
    }
  }

  let result;
  /** Carry floating todo dock across steps (empty stubBefore must not wipe). */
  let lastTodoDock = undefined;
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
  /** Carry device / touch fixture across steps (omit = keep, like todos). */
  let lastDevice = undefined;
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    // The block breadcrumb is scoped to THIS step's own episode, not the
    // whole chain - within episode 2, step 1 should read as "1st of 2,"
    // not "6th of 7." Falls back to the whole chain when this block has no
    // episode (an ad hoc chain with no named Flows), unchanged from before.
    const episodeBlockIndices = r.episodeNumber
      ? resolved.reduce((acc, x, idx) => {
          if (x.episodeNumber === r.episodeNumber) acc.push(idx);
          return acc;
        }, [])
      : resolved.map((_x, idx) => idx);
    const moduleNames = episodeBlockIndices.map((idx) => allNames[idx]);
    const moduleDescriptions = episodeBlockIndices.map((idx) => allDescriptions[idx]);
    const moduleIndex = episodeBlockIndices.indexOf(i);
    // Where a "Retry Episode" click (see the catch block below) rewinds to -
    // the current episode's own first block, or the whole chain's first
    // block when there's no real episode (episodeBlockIndices degrades to
    // the full resolved array in that case, so this is just 0).
    const episodeStartIndex = episodeBlockIndices[0];
    // True only on an episode's own first block - the one moment worth a
    // gentle "you're here now" signal, not every step inside it.
    const justEnteredEpisode = moduleIndex === 0 && r.episodeNumber !== undefined;
    // Seed THIS segment's own json payload now, not earlier - see the long
    // comment where seedMem closures are built, in main()'s resolution
    // loop. Must run before "keys" below reads mem.get() for the panel
    // display, and before this segment's own first block executes.
    if (r.seedMem) r.seedMem();
    // Reset session state before this block if EITHER: the blanket
    // WAYGRAPH_CLEAR_SESSION=1 override is set (a manual, always-on-after-
    // the-first-block stopgap for ad hoc block chains with no real Flow
    // object), OR this specific block is a Flow's own declared entry point
    // (defineFlow(...) wrapped in withSessionReset) reached via a
    // multi-flow chain spec - the proper, opt-in-per-Flow mechanism. Never
    // resets before the very first block - there's no prior state yet.
    //
    // Done HERE, before this step's own "before" panel is even shown - not
    // after the human clicks "Run this step" - so the panel for the new
    // episode appears over an already-fresh page, not the PREVIOUS
    // episode's stale final page (e.g. still showing /dashboard) with the
    // new episode's panel merely floating on top of it ("overlapping",
    // Dan's own word for this). The explicit re-navigate (not just
    // clearing cookies/storage) is what actually makes the page itself
    // look fresh again - clearing storage alone doesn't change what's
    // still rendered on screen.
    if ((clearSession || r.resetSession) && i > 0) {
      await resetPageState(context, page, baseURL);
      // clear() wiped origin storage - re-apply CLI autoplay default.
      await syncAutoplayFromEnv();
    }
    // Episode pace: block > flow > CLI --fast (only when no authored pace).
    // Authoring wins: withDemoPace("slow"|2|4500) keeps slow dwell even under --fast.
    const stepPace = resolveStepDemoPace({
      blockPace: r.block.demoPace,
      flowPace: r.demoPace,
      fastForward: !!r.block.fastForward,
      wasFastForward: !!r.wasFastForward,
    });
    const authoredPace =
      (r.block.demoPace != null && r.block.demoPace !== "") ||
      (r.demoPace != null && r.demoPace !== "");
    const cliFast = demoFast || fastBlockNames.has(r.block.name);
    pacing.demoPace =
      stepPace === "normal" && cliFast && !authoredPace
        ? fastBlockNames.has(r.block.name)
          ? "blitz"
          : "fast"
        : stepPace;
    pacing.gatesFast =
      demoPaceIsFast(pacing.demoPace) ||
      !!r.block.fastForward ||
      !!r.wasFastForward ||
      (!authoredPace && demoFast);
    pacing.gatesSlow = demoPaceIsSlow(pacing.demoPace);
    pacing.skipTheater =
      demoPaceIsBlitz(pacing.demoPace) ||
      fastBlockNames.has(r.block.name) ||
      !!r.block.fastForward ||
      !!r.wasFastForward;
    const fixtures = r.highlightFixtures;
    const flowStyle = r.highlightStyle;
    const stubBeforePhase = await runStubPhase(r.block, "stubBefore", { fixtures, mem });
    if (stubBeforePhase.todoDockUi) {
      await pushTodoDockUi(stubBeforePhase.todoDockUi);
    } else {
      await pushTodoDockUi(undefined);
    }
    stubBeforeRef.current = stubBeforePhase.highlights.map((h) =>
      applyHighlightStyleDefaults(h, flowStyle),
    );
    logStubPhaseFixtures("before", {
      ...stubBeforePhase,
      highlights: stubBeforeRef.current.map((h) => ({
        ...h,
        label: formatHighlightCaption(h),
      })),
    });
    const appliedBefore = applyTodoPhase(lastTodoDock, {
      todoSync: stubBeforePhase.todoSync,
      todoDock: stubBeforePhase.todoDock,
      todos: stubBeforePhase.todos,
      todoPos: stubBeforePhase.todoPos,
    });
    lastTodoDock = appliedBefore.dock;
    todoDockRef.current = lastTodoDock;
    rememberTodoDock(appliedBefore.dock, appliedBefore.sync, !!stubBeforePhase.todoParallel);
    const appliedDeviceBefore = applyDevicePhase(lastDevice, {
      deviceSync: stubBeforePhase.deviceSync,
      device: stubBeforePhase.device,
    });
    lastDevice = appliedDeviceBefore.device;
    deviceRef.current = lastDevice;
    if (appliedDeviceBefore.sync !== "keep" || lastDevice) {
      await applyDeviceToPage(page, lastDevice, appliedDeviceBefore.sync);
    }
    const stubBeforeTodos =
      (lastTodoDock && lastTodoDock.groups[0] && lastTodoDock.groups[0].items) ||
      stubBeforePhase.todos ||
      [];
    const overlayTitle =
      (stubBeforePhase.title && String(stubBeforePhase.title).trim()) ||
      (r.episodeTitle && String(r.episodeTitle).trim()) ||
      title ||
      "waygraph demo";
    const overlayTodoPos =
      (lastTodoDock && lastTodoDock.pos) || stubBeforePhase.todoPos || undefined;
    const isNavBlock = r.block.__waygraphKind === "nav";
    const autoNow = await currentAutoplay();
    // Video / --mini: compact pill. Never pass false - Hide/localStorage wins.
    const forceCollapsed =
      !!process.env.WAYGRAPH_VIDEO ||
      process.env.WAYGRAPH_MINI === "1" ||
      process.env.WAYGRAPH_STEPPER_MINI === "1"
        ? true
        : undefined;
    const requires = r.block.requires ?? [];
    const keys = requires.map((k) => {
      let value = "<not yet set>";
      try {
        value = JSON.stringify(mem.get(k));
      } catch {
        // not written yet - shown as a placeholder, not a crash
      }
      return { name: k.name, value };
    });
    const paceSpeak = paceSpeakFields(pacing.demoPace, autoplayMs);
    if (process.env.WAYGRAPH_JSON !== "1") {
      demoLog(
        "step " +
          (i + 1) +
          "/" +
          resolved.length +
          " " +
          r.block.name +
          " · " +
          paceSpeak.paceLabel +
          (r.episodeNumber ? " · episode " + r.episodeNumber : ""),
      );
      demoLog(
        "  gate~" +
          autoplayMs +
          "ms skipTheater=" +
          !!pacing.skipTheater +
          " gatesFast=" +
          !!pacing.gatesFast,
      );
      demoLog("  " + summarizeDevice(lastDevice));
      const phaseZoom =
        stubBeforePhase.zoom != null && Number(stubBeforePhase.zoom) > 0
          ? Number(stubBeforePhase.zoom)
          : null;
      const phaseZoomOut =
        stubBeforePhase.zoomOut !== undefined ? !!stubBeforePhase.zoomOut : null;
      demoLog(
        "  zoom=" +
          (phaseZoom != null ? phaseZoom + "x" : "default") +
          (phaseZoomOut != null ? " zoomOut=" + phaseZoomOut : "") +
          " (StubCtx / API; live chip top-left when ring zoom >1)",
      );
      logTodoDockFull(lastTodoDock, "  before");
      demoLog("  todoSync=" + appliedBefore.sync);
    }
    await renderBeforeStep(page, {
      index: i,
      total: resolved.length,
      blockName: r.block.name,
      description: r.block.description || "",
      keys,
      allNames: moduleNames,
      allDescriptions: moduleDescriptions,
      moduleIndex,
      allEpisodes,
      justEnteredEpisode,
      title: overlayTitle,
      todoPos: overlayTodoPos,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
      stepperMode,
      forceCollapsed,
      todos: stubBeforeTodos,
      todoDock: lastTodoDock,
      todoSync: appliedBefore.sync,
      todoId: lastTodoDock && lastTodoDock.id,
      ...paceSpeak,
    });
    // Re-paint dock(s) - renderBeforeStep syncs the active one; this enforces replace.
    await syncAllTodoDocks({ parallel: !!stubBeforePhase.todoParallel });
    if (process.env.WAYGRAPH_JSON !== "1") {
      const docks = await probeTodoDocksOnPage(page);
      if (!docks.length && lastTodoDock) {
        demoLog("  WARN todos authored but dock-dom empty (not painted?)");
      } else if (docks.length) {
        demoLog(
          "  dock-dom " +
            docks
              .map(
                (d) =>
                  d.key +
                  "@" +
                  d.pos +
                  " " +
                  d.left +
                  "," +
                  d.top +
                  " " +
                  d.w +
                  "x" +
                  d.h +
                  (d.onScreen ? "" : " OFFSCREEN") +
                  " n=" +
                  d.n +
                  (d.current ? ' cur="' + d.current + '"' : ""),
              )
              .join(" | "),
        );
      }
    }
    const edits = await gate();
    for (const k of requires) {
      if (edits[k.name] !== undefined) {
        try {
          mem.set(k, JSON.parse(edits[k.name]));
        } catch {
          // left as-authored if the human's edit isn't valid JSON
        }
      }
    }
    const recordingVideo = !!process.env.WAYGRAPH_VIDEO;
    await markStepRunning(page, {});
    // NavBlock click-nav: label the upcoming Locator.click demo cursor as
    // "nav: <block>" so pia/demo watchers see cursor+pulse on click nav
    // (not only on regular Block clicks).
    const navClick = r.block.__waygraphNavClick;
    if (r.block.__waygraphKind === "nav" && navClick !== undefined) {
      await page
        .evaluate((label) => {
          window.__wgPendingNavClickLabel = label;
        }, "nav: " + (r.block.name || "click"))
        .catch(() => {});
    } else {
      await page
        .evaluate(() => {
          delete window.__wgPendingNavClickLabel;
        })
        .catch(() => {});
    }
    const stepFlow = engine.defineFlow([start, r.block, end]);
    // { closeOnFinish: false } makes Flow.run return { result, page }, not
    // the plain checkpoint - destructure it, don't treat the wrapper as the
    // checkpoint itself (caught via the standalone verify script: this used
    // to serialize the whole { result, page } object into the panel/log).
    let stepOutcome;
    try {
      stepOutcome = await stepFlow.run(context, mem, { page, closeOnFinish: false });
    } catch (err) {
      await page
        .evaluate(() => {
          delete window.__wgPendingNavClickLabel;
        })
        .catch(() => {});
      // stubOnError + error/expected panel BEFORE acknowledging (PIA RFC).
      const errEdits = await presentFailPanel(page, {
        block: r.block,
        fixtures: r.highlightFixtures,
        highlightStyle: r.highlightStyle,
        error: err,
        index: i,
        total: resolved.length,
        blockName: r.block.name,
        message: err && err.message ? err.message : String(err),
        allNames: moduleNames,
        allDescriptions: moduleDescriptions,
        moduleIndex,
        allEpisodes,
        title,
        episodeNumber: r.episodeNumber,
        episodeTitle: r.episodeTitle,
        expectedFailureReason: r.expectedFailureReason,
        stepperMode,
        gatesFast: pacing.gatesFast,
        demoPace: pacing.demoPace,
        gate,
        mem,
      });
      if (errEdits && errEdits.__wgRetry) {
        await resetPageState(context, page, baseURL);
        await syncAutoplayFromEnv();
        i = episodeStartIndex - 1;
        continue;
      }
      // withExpectedFailure episode (e.g. locked_out_user) - throwing here is
      // the demo working, not a broken run.
      if (r.expectedFailureReason) {
        if (process.env.WAYGRAPH_JSON !== "1") {
          console.log(
            "waygraph: expected failure on " + r.block.name + " - " + r.expectedFailureReason,
          );
        }
        break;
      }
      throw err;
    }
    await page
      .evaluate(() => {
        delete window.__wgPendingNavClickLabel;
      })
      .catch(() => {});
    result = stepOutcome.result;
    // Mid-act Method fill/click advances live on todoDockRef - fold that
    // back into lastTodoDock before stubAfter / next-block keep, or the
    // next step reverts to the pre-act (blank / index-0) checklist.
    if (todoDockRef.current) lastTodoDock = todoDockRef.current;
    // withExpectedFailure last block that SUCCEEDS on the intentional fail
    // branch (e.g. submit-login -> LoginPage + error banner). Still show
    // stubOnError rings + amber "expected outcome" panel - branching no
    // longer throws, but the demo must not skip the educational overlay.
    if (r.expectedFailureReason) {
      const errEdits = await presentFailPanel(page, {
        block: r.block,
        fixtures: r.highlightFixtures,
        highlightStyle: r.highlightStyle,
        error: undefined,
        out: result,
        index: i,
        total: resolved.length,
        blockName: r.block.name,
        message:
          "Resolved " +
          (result && result.__state ? result.__state : JSON.stringify(result)) +
          " (expected failure path)",
        allNames: moduleNames,
        allDescriptions: moduleDescriptions,
        moduleIndex,
        allEpisodes,
        title,
        episodeNumber: r.episodeNumber,
        episodeTitle: r.episodeTitle,
        expectedFailureReason: r.expectedFailureReason,
        stepperMode,
        gatesFast: pacing.gatesFast,
        demoPace: pacing.demoPace,
        gate,
        mem,
      });
      if (errEdits && errEdits.__wgRetry) {
        await resetPageState(context, page, baseURL);
        await syncAutoplayFromEnv();
        i = episodeStartIndex - 1;
        continue;
      }
      if (process.env.WAYGRAPH_JSON !== "1") {
        console.log(
          "waygraph: expected failure on " + r.block.name + " - " + r.expectedFailureReason,
        );
      }
      break;
    }
    const fixturesAfter = r.highlightFixtures;
    const slides = resolveSlides(r.block, { out: result, fixtures: fixturesAfter }).map((s) =>
      applyHighlightStyleDefaults(s, r.highlightStyle),
    );
    if (slides.length > 0) {
      await presentSlides(page, slides, gate, {
        title,
        blockName: r.block.name,
        fast: pacing.gatesFast,
        pace: pacing.demoPace,
        episodeNumber: r.episodeNumber,
        episodeTitle: r.episodeTitle,
        autoplayMs,
      });
    }
    let highlights;
    let stubAfterTodos = [];
    let afterOverlayTitle = overlayTitle;
    let afterTodoPos = overlayTodoPos;
    let appliedAfter = { dock: lastTodoDock, sync: "keep" };
    let appliedDeviceAfter = { device: lastDevice, sync: "keep" };
    let afterTodoParallel = false;
    if (hasAuthoredStubAfter(r.block, result, fixturesAfter)) {
      const afterPhase = await runStubPhase(r.block, "stubAfter", {
        out: result,
        fixtures: fixturesAfter,
        mem,
      });
      if (afterPhase.todoDockUi) {
        await pushTodoDockUi(afterPhase.todoDockUi);
      }
      logStubPhaseFixtures("after", {
        ...afterPhase,
        highlights: (afterPhase.highlights || []).map((h) => {
          const styled = applyHighlightStyleDefaults(h, r.highlightStyle);
          return { ...styled, label: formatHighlightCaption(styled) };
        }),
      });
      afterTodoParallel = !!afterPhase.todoParallel;
      appliedAfter = applyTodoPhase(lastTodoDock, {
        todoSync: afterPhase.todoSync,
        todoDock: afterPhase.todoDock,
        todos: afterPhase.todos,
        todoPos: afterPhase.todoPos,
      });
      lastTodoDock = appliedAfter.dock;
      todoDockRef.current = lastTodoDock;
      rememberTodoDock(appliedAfter.dock, appliedAfter.sync, afterTodoParallel);
      appliedDeviceAfter = applyDevicePhase(lastDevice, {
        deviceSync: afterPhase.deviceSync,
        device: afterPhase.device,
      });
      lastDevice = appliedDeviceAfter.device;
      deviceRef.current = lastDevice;
      if (appliedDeviceAfter.sync !== "keep" || (appliedDeviceAfter.sync === "set" && lastDevice)) {
        await applyDeviceToPage(page, lastDevice, appliedDeviceAfter.sync);
      }
      stubAfterTodos =
        (lastTodoDock && lastTodoDock.groups[0] && lastTodoDock.groups[0].items) ||
        afterPhase.todos ||
        [];
      if (afterPhase.title && String(afterPhase.title).trim()) {
        afterOverlayTitle = String(afterPhase.title).trim();
      }
      if (afterPhase.todoPos) afterTodoPos = afterPhase.todoPos;
      if (lastTodoDock && lastTodoDock.pos) afterTodoPos = lastTodoDock.pos;
      highlights = afterPhase.highlights.map((h) => {
        const styled = applyHighlightStyleDefaults(h, r.highlightStyle);
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
    } else {
      highlights = extractVerifyHighlights(r.block, result.__state).map((h) =>
        applyHighlightStyleDefaults(h, r.highlightStyle),
      );
    }
    await renderAfterStep(page, {
      index: i,
      total: resolved.length,
      blockName: r.block.name,
      result,
      resultTag: JSON.stringify(result),
      highlights,
      gatesFast: pacing.gatesFast,
      pace: pacing.demoPace,
      ...paceSpeakFields(pacing.demoPace, autoplayMs),
      isLast: i === resolved.length - 1,
      allNames: moduleNames,
      allDescriptions: moduleDescriptions,
      moduleIndex,
      allEpisodes,
      title: afterOverlayTitle,
      todoPos: afterTodoPos,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
      stepperMode,
      todos: stubAfterTodos,
      todoDock: lastTodoDock,
      todoSync: appliedAfter.sync,
      todoId: lastTodoDock && lastTodoDock.id,
      todoDockRef,
      forceCollapsed:
        !!process.env.WAYGRAPH_VIDEO ||
        process.env.WAYGRAPH_MINI === "1" ||
        process.env.WAYGRAPH_STEPPER_MINI === "1"
          ? true
          : undefined,
    });
    await syncAllTodoDocks({ parallel: afterTodoParallel });
    // Ring cycle / stubAfter may have advanced the dock - persist for next block.
    if (todoDockRef.current) {
      lastTodoDock = todoDockRef.current;
      rememberTodoDock(todoDockRef.current, "set", afterTodoParallel);
    }
    if (process.env.WAYGRAPH_JSON !== "1") {
      demoLog(
        "  after " +
          summarizeDevice(lastDevice) +
          " deviceSync=" +
          appliedDeviceAfter.sync,
      );
      logTodoDockFull(lastTodoDock, "  after");
      demoLog("  after todoSync=" + appliedAfter.sync);
      const docksAfter = await probeTodoDocksOnPage(page);
      if (!docksAfter.length && lastTodoDock && appliedAfter.sync !== "clear") {
        demoLog("  WARN after: todos authored but dock-dom empty");
      } else if (docksAfter.length) {
        demoLog(
          "  after dock-dom " +
            docksAfter
              .map(
                (d) =>
                  d.key +
                  "@" +
                  d.pos +
                  " " +
                  d.left +
                  "," +
                  d.top +
                  " " +
                  d.w +
                  "x" +
                  d.h +
                  (d.onScreen ? "" : " OFFSCREEN") +
                  " n=" +
                  d.n +
                  (d.current ? ' cur="' + d.current + '"' : ""),
              )
              .join(" | "),
        );
      } else if (appliedAfter.sync === "clear") {
        demoLog("  after dock-dom cleared (expected)");
      }
    }
    await gate();
  }
  await teardownOverlay(page);
  return result;
}
