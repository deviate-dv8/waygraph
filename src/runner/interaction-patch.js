// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { installOverlay } from "./overlay-install.js";
import { applyHighlightZoom, captionForLocator, dwellMatchedStub, ensureLocatorInView, hideRing, matchStubIndexForLocator, showRing, wasJustNarrated } from "./rings.js";
import { syncTodoDockAdvance } from "./todo-dock.js";
import { clickPulseAt, moveCursorTo } from "./cursor.js";
import { demoHighlight } from "./demo-log.js";
import { restoreTheaterAfterNavigation } from "./teardown.js";

export function instrumentInteractionHighlighting(page, mem, slowMo, pacing, stubBeforeRef, todoDockRef, deviceRef) {
  // Playwright's own slowMo ALREADY pauses after every single low-level
  // action it dispatches - and pressSequentially() fires one such action
  // PER CHARACTER. Also giving pressSequentially its own fixed delay
  // double-paces every keystroke (45ms + slowMo's own ~350ms, per
  // character) - an ordinary 22-character email alone stretched past 8
  // seconds. When slowMo is already doing the pacing, add none of our own;
  // only fall back to a small typing delay when slowMo is off entirely.
  //
  // pacing.skipTheater (WAYGRAPH_FAST_BLOCKS **or** FFCompose): near-zero
  // cursor / pop / typing - blitz this step. --fast alone sets gatesFast only
  // (shorter Next/autoplay gates) and must NOT skip theater, or the whole demo
  // looks like plain waygraph run.
  const skipTheater = () => !!pacing.skipTheater;
  const typeDelay = () => (skipTheater() ? 0 : slowMo ? 0 : 30);
  // Click is a single action, not per-character, so it doesn't compound
  // the same way - but slowMo still adds its own pause around the actual
  // click, so trim our own explicit "pop" pauses when it's already active
  // rather than stacking a full 1.2s on top of that.
  const clickPrePop = () => (skipTheater() ? 0 : slowMo ? 300 : 700);
  const clickPostPop = () => (skipTheater() ? 0 : slowMo ? 200 : 500);
  // FF / FAST_BLOCKS: no cursor travel animation (0). Plain theater keeps full.
  const cursorMs = (full) => (skipTheater() ? 0 : full);
  // Locator.fill()/click() only ever see a raw call, no context of where
  // the value came from. Patching mem.get() to remember the most recently
  // read key's name (Blocks read-then-immediately-fill, e.g. const { email
  // } = mem.get(LoginInput.key); ...fill(email)) lets the fill patch below
  // label the ring with the real key, not a generic "writing from mem".
  // Patches this ONE mem instance only, not MemPage's shared prototype -
  // there's exactly one mem per chain run.
  const memTrack = { lastKeyName: null, at: 0 };
  const originalGet = mem.get.bind(mem);
  mem.get = (key) => {
    memTrack.lastKeyName = key && key.name;
    memTrack.at = Date.now();
    return originalGet(key);
  };

  const proto = Object.getPrototypeOf(page.locator("html"));

  if (!proto.__wgFillPatched) {
    proto.__wgFillPatched = true;
    const originalFill = proto.fill;
    proto.fill = async function (value, options) {
      try {
        await installOverlay(page);
        await this.waitFor({
          state: "visible",
          timeout: (options && options.timeout) || 30000,
        }).catch(() => {});
        // Smooth scroll before measuring - otherwise off-screen fields
        // teleport when Playwright's fill actionability scrolls.
        await ensureLocatorInView(this, { instant: skipTheater() });
        const box = await this.boundingBox();
        let typeLabel = "input";
        try {
          const meta = await this.evaluate((el) => {
            const id = (el.id || "").toLowerCase();
            const name = (el.getAttribute("name") || "").toLowerCase();
            const ph = (el.getAttribute("placeholder") || "").toLowerCase();
            const ty = (el.getAttribute("type") || "text").toLowerCase();
            if (ty === "password" || /pass/.test(id + name + ph)) return "password";
            if (/user|email|login/.test(id + name + ph)) return "username";
            if (ty && ty !== "text") return ty;
            return id || name || ph || "input";
          });
          if (meta) typeLabel = String(meta);
        } catch {
          /* ignore */
        }
        if (box && !(await wasJustNarrated(page))) {
          // Only trust the "last mem.get()" as THIS fill's source if it
          // happened recently - a stale read from several actions ago is
          // more likely unrelated than actually describing this field.
          const fallback = memTrack.lastKeyName && Date.now() - memTrack.at < 3000
            ? "from mem: " + memTrack.lastKeyName
            : "writing from mem";
          const stubs = (stubBeforeRef && stubBeforeRef.current) || [];
          const cap = await captionForLocator(page, this, stubs, fallback);
          const stubIdx = await matchStubIndexForLocator(page, this, stubs);
          const stub = stubIdx >= 0 ? stubs[stubIdx] : null;
          await syncTodoDockAdvance(page, todoDockRef, stubIdx, stub);
          await moveCursorTo(page, box, cursorMs(500));
          if (stub) {
            await applyHighlightZoom(page, stub.selector, stub.zoom, stub.zoomOut);
          }
          demoHighlight(
            {
              selector: stub && stub.selector,
              label: cap.label,
              tone: cap.tone || (stub && stub.tone) || "planned",
              color: stub && stub.color,
              focus: !!(stub && stub.focus),
              zoom: stub && stub.zoom,
              zoomOut: stub && stub.zoomOut,
              gesture: stub && stub.gesture,
              weight: cap.weight,
              size: cap.size,
            },
            "fill",
          );
          await showRing(page, box, cap.label, cap.tone, {
            size: cap.size,
            weight: cap.weight,
            selector: stub && stub.selector ? stub.selector : undefined,
            focus: !!(stub && stub.focus),
          });
          await dwellMatchedStub(page, this, stubs, pacing);
          await new Promise((res) => setTimeout(res, skipTheater() ? 0 : 200));
          if (cap && cap.label) typeLabel = String(cap.label).slice(0, 40);
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor there, just skip re-showing the ring with a generic label.
          await moveCursorTo(page, box, cursorMs(200));
        }
        await page
          .evaluate((label) => {
            if (window.__wgSetTypingBadge) window.__wgSetTypingBadge(true, label);
          }, typeLabel)
          .catch(() => {});
      } catch {
        // best-effort - element not visible/attached yet is not this
        // instrumentation's problem, the real fill below still runs
      }
      let result;
      try {
        // NOT this.clear() - Locator.clear() is itself implemented as
        // fill(""), and since fill is patched on the shared prototype,
        // that call would resolve back to THIS same patched function and
        // recurse forever. Call the real original fill directly instead.
        await originalFill.call(this, "", { timeout: options && options.timeout });
        result = await this.pressSequentially(String(value), { delay: typeDelay(), timeout: options && options.timeout });
      } catch {
        // pressSequentially unsupported on this element (e.g. a
        // contenteditable div, or a locator .fill() genuinely needs to
        // handle specially) - fall back to the real, unpatched fill.
        result = await originalFill.call(this, value, options);
      }
      await page
        .evaluate(() => {
          if (window.__wgSetTypingBadge) window.__wgSetTypingBadge(false);
        })
        .catch(() => {});
      // Fade the ring back out once this field is actually done, instead
      // of leaving it lit until the next Block's own before-panel clears
      // it - it was sticking around through the whole rest of the step.
      await hideRing(page);
      await restoreTheaterAfterNavigation(page, todoDockRef, deviceRef, stubBeforeRef);
      return result;
    };
  }

  if (!proto.__wgClickPatched) {
    proto.__wgClickPatched = true;
    const originalClick = proto.click;
    proto.click = async function (options) {
      let clickPoint = null;
      let clickTone = "auto";
      try {
        await installOverlay(page);
        // Wait until the target is visible BEFORE measuring - otherwise
        // defineNavBlock({ click }) (and any slow-to-appear control) skips
        // the cursor entirely: boundingBox was null, then originalClick
        // waited and clicked with no demo animation.
        await this.waitFor({
          state: "visible",
          timeout: (options && options.timeout) || 30000,
        }).catch(() => {});
        // Smooth-scroll off-screen targets before cursor/ring. Playwright's
        // own click scroll is instant and reads as a teleport under --fast.
        await ensureLocatorInView(this, { instant: skipTheater() });
        const box = await this.boundingBox();
        const narrated = box ? await wasJustNarrated(page) : false;
        if (box && !narrated) {
          let fallback = "click";
          try {
            const text = (await this.textContent())?.trim();
            if (text && text.length > 0 && text.length <= 30) fallback = text;
          } catch {
            // element has no simple text (an icon button, say) - generic label is fine
          }
          // Prefer "nav: …" when this locator is a NavBlock click target
          // (set on page by runStepMode just before act).
          try {
            const navLabel = await page.evaluate(() => window.__wgPendingNavClickLabel || null);
            if (navLabel) fallback = String(navLabel);
          } catch {
            /* ignore */
          }
          const stubs = (stubBeforeRef && stubBeforeRef.current) || [];
          const cap = await captionForLocator(page, this, stubs, fallback);
          const stubIdx = await matchStubIndexForLocator(page, this, stubs);
          const stub = stubIdx >= 0 ? stubs[stubIdx] : null;
          await syncTodoDockAdvance(page, todoDockRef, stubIdx, stub);
          clickTone = cap.tone;
          clickPoint = await moveCursorTo(page, box, cursorMs(600));
          if (stub) {
            await applyHighlightZoom(page, stub.selector, stub.zoom, stub.zoomOut);
          }
          demoHighlight(
            {
              selector: stub && stub.selector,
              label: cap.label,
              tone: cap.tone || (stub && stub.tone) || "planned",
              color: stub && stub.color,
              focus: !!(stub && stub.focus),
              zoom: stub && stub.zoom,
              zoomOut: stub && stub.zoomOut,
              gesture: stub && stub.gesture,
              weight: cap.weight,
              size: cap.size,
            },
            "click",
          );
          await showRing(page, box, cap.label, cap.tone, {
            size: cap.size,
            weight: cap.weight,
            selector: stub && stub.selector ? stub.selector : undefined,
            focus: !!(stub && stub.focus),
          });
          await dwellMatchedStub(page, this, stubs, pacing);
          // "pop for a few seconds" - Dan's own phrase, matching the
          // zsign demo-engine's ring-before-click pattern in
          // services/help-center-clip-engine's video-pipeline.
          await new Promise((res) => setTimeout(res, clickPrePop()));
        } else if (box) {
          // Ring/caption already handled by narrate() - still move the
          // cursor + pulse the click point, just skip re-showing the ring.
          clickPoint = await moveCursorTo(page, box, cursorMs(200));
          clickTone = "planned";
        }
      } catch {
        // best-effort - the real click below still runs either way
      }
      if (clickPoint) {
        await clickPulseAt(page, clickPoint.x, clickPoint.y, clickTone);
        // clickPulseAt only triggers the CSS animation class - it doesn't
        // wait for it. Without a pause here, the real click (and any
        // resulting navigation/DOM change) fires while the ripple is still
        // mid-animation, sometimes cutting it off before it's even visible.
        // Wait out the same .5s the "@keyframes wg-pulse" rule uses, so the
        // mock click visually completes before the real one fires.
        await new Promise((res) => setTimeout(res, skipTheater() ? 0 : 500));
      }
      // Touch theater (0.13+): prefer Locator.tap / long-press when device
      // touchMode is on (context launched with hasTouch). gesture on stub
      // wins: tap | hold | click.
      let result;
      const stubsForGesture = (stubBeforeRef && stubBeforeRef.current) || [];
      let gesture = "click";
      try {
        const idx = await matchStubIndexForLocator(page, this, stubsForGesture);
        const stub = idx >= 0 ? stubsForGesture[idx] : null;
        if (stub && stub.gesture) gesture = stub.gesture;
        else if (deviceRef && deviceRef.current && deviceRef.current.touchMode) gesture = "tap";
      } catch {
        if (deviceRef && deviceRef.current && deviceRef.current.touchMode) gesture = "tap";
      }
      if (gesture === "tap" || gesture === "hold") {
        try {
          if (gesture === "hold") {
            result = await this.tap({
              ...(options || {}),
              delay: skipTheater() ? 0 : 600,
            });
          } else {
            result = await this.tap(options);
          }
        } catch {
          result = await originalClick.call(this, options);
        }
      } else {
        result = await originalClick.call(this, options);
      }
      await new Promise((res) => setTimeout(res, clickPostPop()));
      await hideRing(page);
      // Full document navigation drops #wg-todo-dock + rings; restore carry.
      await restoreTheaterAfterNavigation(page, todoDockRef, deviceRef, stubBeforeRef);
      return result;
    };
  }

  // Caps any Locator.waitFor()/page.waitForTimeout() timeout during step
  // mode - a Block polling for something that will NEVER happen (e.g. "is
  // there an unverified-account banner" on an account that IS verified)
  // has no choice but to wait out its own hardcoded timeout in full before
  // concluding "no". Only the WAIT gets capped, never the real outcome -
  // if the thing genuinely appears at 800ms into a 5000ms wait, waitFor
  // still resolves at 800ms same as always; this only shortens the "it's
  // just never going to happen" case. Plain setTimeout()-based sleep()
  // helpers some Blocks use for their own pacing are NOT Playwright calls
  // at all and can't be touched this way - a real, disclosed limit, not
  // silently ignored.
  // Pushed down to 700ms earlier this session based on login.block.ts
  // alone - every waitFor() there is a "give up gracefully" pattern
  // (wrapped in .catch()/Promise.race, a timeout IS the expected negative
  // result). That's a different kind of wait than a REQUIRED
  // synchronization point with no catch - e.g. overview-metrics.block.ts
  // waits (uncaught) for a "Loading pending actions..." placeholder to
  // actually appear before it's safe to check for an error, a real
  // hydration signal the block's own comment calls "deterministic,"
  // not a probe. A flat 700ms cap broke that block outright on this
  // shared, loaded box (a real 3-block chain run threw instead of
  // catching). Bumping the SAME flat cap to 4000ms to cover it just
  // reintroduced most of the original torture on login.block.ts's own
  // 5000ms unverified-email check - 4000ms is barely better than the real
  // 5000ms it's capping.
  //
  // A single flat number can't serve both: it has no way to tell "safe to
  // cut short" from "must actually happen" apart from the outside. But
  // each call site's OWN declared timeout is already a real signal of
  // which kind it is - a Block author who wrote timeout: 5000 for a quick
  // conditional check and one who wrote timeout: 15000 for a real
  // hydration wait weren't picking the same number by accident. Scale the
  // cap off that instead of a single constant: 30% of whatever was
  // declared, never below a 700ms floor (the value already proven safe
  // for the fast/common case), and never above what was declared in the
  // first place. login's 5000ms check -> 1500ms (still 3.5s faster than
  // uncapped). overview-metrics' 15000ms wait -> 4500ms (more headroom
  // than the flat 4000ms fix, not less).
  const WAIT_CAP_FLOOR_MS = 700;
  const WAIT_CAP_FRACTION = 0.3;
  const scaledWaitCap = (declared) => Math.max(WAIT_CAP_FLOOR_MS, declared * WAIT_CAP_FRACTION);
  if (!proto.__wgWaitForPatched) {
    proto.__wgWaitForPatched = true;
    const originalWaitFor = proto.waitFor;
    proto.waitFor = function (options) {
      const declared = (options && options.timeout) || 30000;
      const capped = { ...(options || {}), timeout: Math.min(declared, scaledWaitCap(declared)) };
      return originalWaitFor.call(this, capped);
    };
  }
  const pageProto = Object.getPrototypeOf(page);
  if (!pageProto.__wgWaitForTimeoutPatched) {
    pageProto.__wgWaitForTimeoutPatched = true;
    const originalWaitForTimeout = pageProto.waitForTimeout;
    pageProto.waitForTimeout = function (ms) {
      // A plain sleep (not a "wait for condition X") never has a hidden
      // "must actually happen" requirement attached - always safe to cut
      // to the floor, no scaling needed.
      return originalWaitForTimeout.call(this, Math.min(ms, WAIT_CAP_FLOOR_MS));
    };
  }
}
