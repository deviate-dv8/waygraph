// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { findBlock, findFlow, parseChainSpec } from "./discovery.js";
import { seedMemForBlock, seedMemForFlow } from "./seed-mem.js";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { isExpectedChainFailure, parseVideoViewport, runChainedFlows, runJsonReportMode } from "./chain-run.js";
import { runStepMode } from "./step-mode.js";
import { connect } from "../types.js";
import { MemPage } from "../mem-page.js";
import { Engine, start, end, chainFlow, isFastForwardBlock } from "../engine.js";

async function main() {
  const projectDir = process.argv[2];
  const spec = process.argv[3];
    const mem = new MemPage();
  // Computed early - JSON-report mode's stdout is meant to be ONE parseable
  // JSON object for whatever's reading it afterward (a script, an agent),
  // not a human's console. Every informational console.log below is
  // skipped for it; only the final JSON report (or a thrown Error, for a
  // truly unexpected failure outside runJsonReportMode's own try/catch)
  // reaches stdout.
  const jsonReport = process.env.WAYGRAPH_JSON === "1";
  const ffExpand =
    process.env.WAYGRAPH_FF_EXPAND === "1" || process.env.WAYGRAPH_FF_DISABLED === "1";
  const ffDisabled = process.env.WAYGRAPH_FF_DISABLED === "1";
  /** Expand or keep fastForwardComposeBlock units for demo/run step lists. */
  const flattenBlockInfos = (blockInfos) => {
    const out = [];
    for (const bi of blockInfos) {
      const b = bi.block;
      if (ffExpand && isFastForwardBlock(b)) {
        for (const step of b.steps()) {
          out.push({
            name: step.name,
            block: step.block,
            ...(step.routes ? { routes: step.routes } : {}),
            ...(bi.resetSessionBefore ? { resetSessionBefore: true } : {}),
            // Dispute / --ff-disabled: keep blitz pacing on former FF inners so
            // wall-clock stays comparable to opaque FF (same real acts).
            wasFastForward: true,
            ffSource: b.name,
          });
        }
      } else {
        out.push(bi);
      }
    }
    return out;
  };
  let resolved = [];
  let chainFlows = null;
  // A bare identifier (no "(", no "then") might name an existing Flow
  // that's already wired up (e.g. loginFlow) - try that FIRST so pointing
  // at real, already-built flows needs no chain-spec typing at all. Falls
  // through to ordinary block-chain parsing if nothing matches.
  const bareRef = /^[A-Za-z_$][\w]*$/.test(spec.trim()) ? spec.trim() : null;
  if (bareRef) {
    const flow = await findFlow(projectDir, bareRef);
    if (flow && typeof flow.blocks === "function") {
      const blockInfos = flattenBlockInfos(flow.blocks());
      // Same --data / WAYGRAPH_DATA seeding as the multi-segment path.
      // Without this, `waygraph run shop.flow.ts --data '{...}'` (and bare
      // export names) hit preflight with an empty MemPage.
      const stubActive = flow.memStub === true || process.env.WAYGRAPH_MEM_STUB === "1";
      const seedMem = () => seedMemForFlow(mem, blockInfos, undefined, bareRef, stubActive);
      resolved = blockInfos.map((bi, idx) => ({
        block: bi.block,
        exportName: bi.name,
        seedMem: idx === 0 ? seedMem : undefined,
        highlightFixtures: flow.highlightFixtures,
        demoPace: flow.demoPace,
        highlightStyle: flow.highlightStyle,
        expectedFailureReason:
          flow.expectedFailureReason && idx === blockInfos.length - 1
            ? flow.expectedFailureReason
            : undefined,
        ...(bi.wasFastForward ? { wasFastForward: true, ffSource: bi.ffSource } : {}),
      }));
      chainFlows = [flow];
      if (!jsonReport) {
        console.log(
          'waygraph: running existing flow "' + bareRef + '" - ' +
            resolved.map((r) => r.block.name).join(" -> ") + " (" + resolved.length + " block" +
            (resolved.length === 1 ? "" : "s") + ", no chain spec needed)",
        );
        if (ffDisabled) {
          console.error(
            "waygraph demo: --ff-disabled - FFCompose expanded to inners (dispute / step locus); blitz pacing kept on former FF steps",
          );
        }
      }
    }
  }
  if (resolved.length === 0) {
    const segments = parseChainSpec(spec);
    if (segments.length === 0) {
      throw new Error("waygraph chain: empty spec - give at least one block name");
    }
    // Each "then"-separated segment can ALSO name an existing Flow (a
    // Flow's own requires, unioned across its Blocks, take the same
    // JSON-payload shape a single Block's requires would), not just a
    // Block. "loginFlow then dashboardFlow" chains two whole Flows one
    // after another - a bare Block segment gets wrapped as its own
    // trivial one-Block Flow so the whole spec reduces to one thing:
    // chainFlow(...) does the actual sequencing (session-reset boundaries
    // included) that used to be hand-rolled here - this is a thin wrapper
    // over the real engine primitive, not a second copy of its logic.
    const wrapEngine = new Engine();
    const flows = [];
    // Parallel to flows - only a REAL named Flow (found via findFlow)
    // counts as an "episode" a human would want labeled; a bare Block
    // segment gets wrapped as its own trivial one-Block Flow so it can
    // still flow through chainFlow's sequencing uniformly, but it's not
    // an authored scenario and gets no episode number - keeps the plain
    // "quick ad hoc block chain" case free of meaningless "Episode 1"/
    // "Episode 2" labels on things that were never episodes to begin with.
    const flowMeta = [];
    let episodeCounter = 0;
    // seedMem is a closure, NOT called here - seeding every segment's own
    // json payload eagerly, all upfront during resolution, was a real bug:
    // mem is one shared object, so when two segments require the SAME key
    // (e.g. two segments both requiring LoginCreds, each with a DIFFERENT
    // payload - "login as standard_user then login as locked_out_user"),
    // the LAST segment resolved silently overwrote the first's value
    // before either segment had even started running - so the FIRST
    // segment's own blocks would run against the SECOND segment's
    // credentials. Deferred to execution time instead (runStepMode calls
    // this exactly once, right as each segment's first block is reached -
    // see resolved[i].seedMem below), same moment session-reset already
    // happens for the same reason.
    for (const seg of segments) {
      const flow = await findFlow(projectDir, seg.ref);
      if (flow && typeof flow.blocks === "function") {
        flows.push(flow);
        episodeCounter += 1;
        const stubActive = flow.memStub === true || process.env.WAYGRAPH_MEM_STUB === "1";
        flowMeta.push({
          episodeNumber: episodeCounter,
          episodeTitle: flow.title || seg.ref,
          expectedFailureReason: flow.expectedFailureReason,
          highlightFixtures: flow.highlightFixtures,
          demoPace: flow.demoPace,
          highlightStyle: flow.highlightStyle,
          seedMem: () => seedMemForFlow(mem, flow.blocks(), seg.json, seg.ref, stubActive),
        });
      } else {
        const r = await findBlock(projectDir, seg.ref);
        flows.push(wrapEngine.defineFlow([start, r.block, end]));
        // A bare Block segment (no Flow, no withMemStub to opt in) only gets
        // memStub via the global --mem-stub/WAYGRAPH_MEM_STUB override.
        const stubActive = process.env.WAYGRAPH_MEM_STUB === "1";
        flowMeta.push({
          episodeNumber: undefined,
          episodeTitle: undefined,
          highlightFixtures: undefined,
          demoPace: undefined,
          highlightStyle: undefined,
          seedMem: () => seedMemForBlock(mem, r, seg.json, stubActive),
        });
      }
    }
    const combinedBlocks = flattenBlockInfos(chainFlow(...flows).blocks());
    let fi = 0;
    // Episode lengths must follow the same flatten so remainingInFlow stays aligned.
    const flowLengths = flows.map((f) => flattenBlockInfos(f.blocks()).length);
    let remainingInFlow = flowLengths[0];
    let isFirstOfSegment = true;
    resolved = combinedBlocks.map((bi) => {
      while (remainingInFlow === 0) {
        fi += 1;
        remainingInFlow = flowLengths[fi];
        isFirstOfSegment = true;
      }
      const meta = flowMeta[fi];
      const entry = {
        block: bi.block,
        exportName: bi.name,
        resetSession: bi.resetSessionBefore === true,
        episodeNumber: meta.episodeNumber,
        episodeTitle: meta.episodeTitle,
        highlightFixtures: meta.highlightFixtures,
        demoPace: meta.demoPace,
        highlightStyle: meta.highlightStyle,
        expectedFailureReason:
          meta.expectedFailureReason && remainingInFlow === 1 ? meta.expectedFailureReason : undefined,
        seedMem: isFirstOfSegment ? meta.seedMem : undefined,
        ...(bi.wasFastForward ? { wasFastForward: true, ffSource: bi.ffSource } : {}),
      };
      remainingInFlow -= 1;
      isFirstOfSegment = false;
      return entry;
    });
    chainFlows = flows;
    if (!jsonReport) {
      console.log(
        "waygraph: chaining " + resolved.map((r) => r.block.name).join(" -> ") +
          " (" + resolved.length + " block" + (resolved.length === 1 ? "" : "s") + ")",
      );
    }
  }
  const step = process.env.WAYGRAPH_STEP === "1";
  // Stepping through headless defeats the point for a MANUAL demo - a
  // human can't watch it. But an explicit WAYGRAPH_HEADED=0 always wins
  // over that default: --auto-play-video sets STEP=1 (it still needs the
  // overlay/narration machinery) AND HEADED=0 (unattended + recorded,
  // nobody has to watch a live window for it to be right).
  const headed =
    process.env.WAYGRAPH_HEADED === "0" ? false : process.env.WAYGRAPH_HEADED === "1" || step;
  // Step mode: blitz Playwright slowMo when any opaque FF **or** former-FF
  // inners (--ff-disabled) are in the resolved list. Explicit WAYGRAPH_SLOWMO wins.
  const hasFfBlitz = resolved.some(
    (r) =>
      r &&
      ((r.block && r.block.fastForward === true) || r.wasFastForward === true),
  );
  const slowMo = process.env.WAYGRAPH_SLOWMO !== undefined
    ? Number(process.env.WAYGRAPH_SLOWMO)
    : step
      ? hasFfBlitz
        ? 0
        : 350
      : undefined;
  if (step && hasFfBlitz && process.env.WAYGRAPH_SLOWMO === undefined && !jsonReport) {
    console.error(
      ffDisabled
        ? "waygraph demo: --ff-disabled (expanded) -> Playwright slowMo=0 on former FF steps (blitz; same acts as opaque FF)"
        : "waygraph demo: opaque FFCompose in flow -> Playwright slowMo=0 (blitz); set WAYGRAPH_SLOWMO to override",
    );
  }
  const baseURL = process.env.WAYGRAPH_BASE_URL;
  const title = process.env.WAYGRAPH_TITLE;
  // Comma-separated Block names (their real .name, e.g. "login") that
  // should blow past the overlay's own added dwell (ring pop, cursor
  // travel, typing delay, and that block's own gates) - "I want the login
  // block to be faster than the rest of the demo," Dan's own phrase.
  // FFCompose blocks get the same skipTheater automatically (no need to
  // list them here). Distinct from --fast (gates only).
  const fastBlockNames = new Set(
    (process.env.WAYGRAPH_FAST_BLOCKS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // Off by default - a same-user chain (login -> dashboard -> ...) needs
  // to STAY authenticated across its own blocks. Only a chain deliberately
  // re-visiting an auth entry point (e.g. "login" appearing twice, to
  // demo the same flow starting fresh each time) needs this.
  const clearSession = process.env.WAYGRAPH_CLEAR_SESSION === "1";
  const videoEnv = process.env.WAYGRAPH_VIDEO;
  let videoDir = null;
  if (videoEnv) {
    videoDir = videoEnv === "1" ? join(projectDir, ".waygraph-videos") : videoEnv;
    mkdirSync(videoDir, { recursive: true });
  }
  /** Fixed 16:9 capture for --video (demo QA and headless run). Step+video no longer maximizes. */
  const DEFAULT_VIDEO_VIEWPORT = { width: 1920, height: 1080 };
  const DEFAULT_RUN_VIDEO_VIEWPORT = { width: 1280, height: 720 };
  const videoViewportParsed = parseVideoViewport(process.env.WAYGRAPH_VIDEO_VIEWPORT);
  const fixedVideoViewport = videoDir
    ? (videoViewportParsed ?? (step ? DEFAULT_VIDEO_VIEWPORT : DEFAULT_RUN_VIDEO_VIEWPORT))
    : null;
  const engine = new Engine({ headless: !headed, slowMo });
  let result;
  // Non-interactive execution (no --step) runs the whole chain as one
  // composed flow with no per-block loop of its own to defer seeding
  // into - it can't support two segments needing DIFFERENT values for the
  // SAME mem key (e.g. two segments both requiring LoginCreds, each with
  // its own payload). Fall back to seeding every segment eagerly, upfront -
  // the same limitation "chain" always had; only --step's own runStepMode
  // loop actually needs (and correctly supports, via resolved[i].seedMem)
  // per-segment differentiated values.
  if (!step && !jsonReport) {
    for (const r of resolved) {
      if (r.seedMem) r.seedMem();
    }
  }
  if (step || jsonReport || baseURL || videoDir) {
    const { chromium } = await import("@playwright/test");
    // --start-maximized (step mode only): viewport: null alone only made
    // the PAGE content track the window - the actual browser WINDOW still
    // launched at Chromium's own default size/position, which stayed put
    // where it was for a previous, larger monitor and looked chopped off on
    // a smaller one. Maximizing fills whatever screen it's actually on.
    // Same CHROME_PATH/CHROMIUM_PATH rule as Engine.run(mem): prefer the
    // system/Flatpak Chromium when set, otherwise Playwright's bundled build.
    // Without this, STEP mode always launched a different-looking browser than
    // headed Engine runs / waygraph-demo.mjs (which already resolve Flatpak).
    const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH || undefined;
    // Maximized for interactive step, and for fixed video viewport so the
    // locked record size can actually fit (otherwise .webm gets grey pad).
    const browser = await chromium.launch({
      headless: !headed,
      slowMo,
      args: step || fixedVideoViewport ? ["--start-maximized"] : [],
      ...(executablePath ? { executablePath } : {}),
    });
    const contextOpts = fixedVideoViewport
      ? {
          baseURL,
          viewport: fixedVideoViewport,
          // Lock DPR so --video-viewport 800x450 stays 800x450 in the .webm
          // (HiDPI hosts otherwise scale recordVideo to e.g. 1920x1080).
          deviceScaleFactor: 1,
          hasTouch: true,
        }
      : step
        ? { baseURL, viewport: null, hasTouch: true }
        : { baseURL, viewport: { width: 1280, height: 720 }, hasTouch: true };
    if (videoDir) {
      contextOpts.recordVideo = fixedVideoViewport
        ? { dir: videoDir, size: fixedVideoViewport }
        : { dir: videoDir };
    }
    const context = await browser.newContext(contextOpts);
    let pageForVideo = null;
    try {
      if (step) {
        const page = await context.newPage();
        pageForVideo = page;
        if (fixedVideoViewport) page.__wgVideoViewport = fixedVideoViewport;
        // Step 1's "before" panel used to sit over a blank about:blank page
        // until the human clicked Run - show the real destination first.
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        result = await runStepMode(engine, start, end, context, page, mem, resolved, slowMo, title, fastBlockNames, clearSession, baseURL);
      } else if (jsonReport) {
        const page = await context.newPage();
        pageForVideo = page;
        if (fixedVideoViewport) page.__wgVideoViewport = fixedVideoViewport;
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        const report = await runJsonReportMode(engine, start, end, context, page, mem, resolved, baseURL);
        console.log(JSON.stringify(report, null, 2));
        if (!report.ok) process.exitCode = 1;
        return;
      } else {
        const page = await context.newPage();
        pageForVideo = page;
        if (fixedVideoViewport) page.__wgVideoViewport = fixedVideoViewport;
        if (baseURL) {
          await page.goto(baseURL).catch(() => {});
        }
        if (chainFlows && chainFlows.length > 0) {
          result = await runChainedFlows(chainFlow, chainFlows, context, mem, page);
        } else {
          const blocks = resolved.map((r) => r.block);
          const chained = blocks.reduce((a, b) => connect(a, b));
          const flow = engine.defineFlow([start, chained, end]);
          result = await flow.run(context, mem, { page, closeOnFinish: false });
        }
      }
    } finally {
      await context.close();
      const savedVideo =
        pageForVideo?.video() !== null && pageForVideo?.video() !== undefined
          ? await pageForVideo.video()?.path().catch(() => null)
          : null;
      if (savedVideo) {
        console.log("waygraph: video saved to " + savedVideo);
      }
      await browser.close();
    }
  } else {
    if (chainFlows && chainFlows.length > 0) {
      try {
        result = await chainFlow(...chainFlows).run(mem);
      } catch (err) {
        if (isExpectedChainFailure(chainFlows, err)) {
          result = { __expectedFailure: true, message: err && err.message ? err.message : String(err) };
        } else {
          throw err;
        }
      }
    } else {
      const blocks = resolved.map((r) => r.block);
      const chained = blocks.reduce((a, b) => connect(a, b));
      const flow = engine.defineFlow([start, chained, end]);
      const recordVideo = videoDir ? { dir: videoDir } : undefined;
      result = await flow.run(mem, recordVideo ? { recordVideo } : undefined);
    }
  }
  if (result && result.__expectedFailure) {
    console.log("waygraph: chain finished (expected failure on last episode) -- " + result.message);
  } else {
    console.log("waygraph: chain finished -- " + JSON.stringify(result));
  }
}

export function startRunner() {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
}
