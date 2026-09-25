// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { installOverlay } from "./overlay-install.js";
import { applyDeviceToPage } from "./device-stage.js";
import { showRing } from "./rings.js";
import { formatHighlightCaption } from "../highlights.js";

/**
 * Patches Locator.prototype.fill (via any real locator's own prototype
 * chain - Playwright doesn't export the class directly) so every fill(),
 * regardless of how the Block built that locator (page.locator, chained
 * .getByLabel off a scoped form locator, etc.), highlights the real target
 * first, then types it out character by character instead of snapping the
 * whole value in - "when something is written from mem, it should
 * highlight then slowly input." One-time patch (idempotent - guarded so a
 * multi-step chain doesn't re-wrap an already-wrapped fill).
 */
/**
 * Called once the gate resolves - manual click OR autoplay timeout, both
 * covered from here rather than duplicating this in the in-page click
 * handler - right before the Block's own act() actually starts. Dan: "i
 * want the button, step is running thing. so i wont be able to interrupt
 * the playwright automation" - the "Run this step" button used to sit
 * there still looking clickable for the entire multi-second duration a
 * real act()/observe() takes, inviting a confusing extra click (harmless -
 * __wgNext no-ops once already consumed - but looked live when it wasn't).
 * Disables the button and mem-key textareas, and swaps whichever gate
 * text was showing (manual button or "Auto-advancing...") to "Running...".
 * ALWAYS collapses the panel while act() runs - leaving it expanded was a
 * real bug: #wg-panel sits at z-index max with pointer-events:auto, so
 * Playwright's login/add-to-cart clicks hit the stepper instead of the app
 * ("subtree intercepts pointer events"). Empty/partial fills + a lucky
 * edge click on Login then produced Sauce Demo's Epic sadface, verify
 * still passed on the error banner, and the next block blew up. Collapse
 * also matches Dan's "step is running / can't interrupt" ask. (_opts kept
 * for call-site compat; autoCollapsePanel is now unconditional.)
 */
export async function markStepRunning(page, _opts) {
  await page
    .evaluate(() => {
      const runBtn = __wgById("wg-run");
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "Running \u25B6";
      }
      const autoEl = __wgById("wg-gate-auto");
      if (autoEl) autoEl.textContent = "Running...";
      __wgQA("#wg-panel textarea[data-key]").forEach((ta) => {
        ta.disabled = true;
      });
      const panel = __wgById("wg-panel");
      if (panel) {
        panel.classList.add("wg-collapsed");
        panel.setAttribute("data-wg-collapsed", "1");
        panel.setAttribute("data-wg-phase", "running");
        if (typeof window.__wgStampModal === "function") {
          window.__wgStampModal(panel, "panel", {
            phase: "running",
            ready: true,
          });
        }
        const toggle = panel.querySelector("[data-wg-toggle]");
        if (toggle) toggle.textContent = "Show";
        const titleEl = panel.querySelector(".wg-chrome-title");
        const label = panel.dataset.wgStepLabel;
        if (titleEl && label) titleEl.textContent = label;
        const miniNext = panel.querySelector("[data-wg-mini-next]");
        if (miniNext) {
          miniNext.disabled = true;
          miniNext.classList.remove("wg-mini-next-show");
        }
      }
    })
    .catch(() => {});
}


/**
 * Real navigation wipes document + overlay helpers. Reinstall and re-paint
 * carried todos / device / optional stubBefore ring so keep-dock and nav
 * highlights do not vanish until the next ctx.todos() / stubAfter (PIA #15).
 */
export async function restoreTheaterAfterNavigation(page, todoDockRef, deviceRef, stubBeforeRef) {
  const needs =
    (await page
      .evaluate(() => !window.__wgSyncTodos || !__wgById("wg-ring"))
      .catch(() => true)) || false;
  if (!needs) {
    // Overlay survived (SPA / no full document wipe) - still refresh dock
    // if Node has a carry and the DOM lost .wg-todo-dock.
    const hasDock = await page
      .evaluate(() => !!__wgQ(".wg-todo-dock, #wg-todo-dock"))
      .catch(() => false);
    if (hasDock || !todoDockRef || !todoDockRef.current) return;
  }
  await installOverlay(page);
  const dock = todoDockRef && todoDockRef.current;
  if (dock) {
    await page
      .evaluate((d) => {
        if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "set", dock: d });
      }, dock)
      .catch(() => {});
  }
  if (deviceRef && deviceRef.current) {
    await applyDeviceToPage(page, deviceRef.current, "set").catch(() => {});
  }
  // Re-show first matching stubBefore ring if selector still exists (sidebar
  // nav targets often survive the route change).
  const stubs = (stubBeforeRef && stubBeforeRef.current) || [];
  for (const h of stubs) {
    if (!h || !h.selector) continue;
    const box = await page
      .evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, h.selector)
      .catch(() => null);
    if (box) {
      await showRing(page, box, formatHighlightCaption(h), h.tone || "planned", {
        size: h.size,
        weight: h.weight,
        selector: h.selector,
        focus: !!h.focus,
      }).catch(() => {});
      break;
    }
  }
}


/**
 * Removes every overlay element (panel, ring, ring-label, cursor,
 * click-pulse, banner) and stops the live resize/scroll ring tracker, once
 * the whole chain is genuinely done - "I want to see the same page just
 * like the demo opened for the first time," not the last step's panel and
 * highlight ring stuck over the real app forever. installOverlay only ever
 * ADDS these elements back on demand (idempotent, per-page-load) - nothing
 * re-creates them once torn down here unless another Block/fill/click runs.
 */
export async function teardownOverlay(page) {
  await page
    .evaluate(() => {
      if (window.__wgRingTrack) {
        window.removeEventListener("resize", window.__wgRingTrack);
        window.removeEventListener("scroll", window.__wgRingTrack, true);
        window.__wgRingTrack = null;
      }
      window.__wgNarrateOwnsRing = false;
      for (const id of [
        "wg-panel",
        "wg-ring",
        "wg-ring-label",
        "wg-cursor",
        "wg-click-pulse",
        "wg-banner",
        "wg-todo-dock",
        "wg-device-shell",
        "wg-device-toast",
        "wg-device-badge",
      ]) {
        const el = __wgById(id);
        if (el) el.remove();
      }
      __wgQA(".wg-todo-dock").forEach((el) => el.remove());
      document.documentElement.classList.remove("wg-video-device-stage");
    })
    .catch(() => {});
}


/**
 * Clears cookies + storage and re-navigates to a known-fresh page. Shared by
 * the per-block session-reset check below and by the error panel's own
 * "Retry Episode" button - a retry needs the exact same clean slate a normal
 * episode boundary gets, not just re-running the failed block against
 * whatever broken/half-navigated state it left the page in.
 */
export async function resetPageState(context, page, baseURL) {
  await context.clearCookies().catch(() => {});
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage blocked (e.g. about:blank) - nothing to clear anyway */
      }
    })
    .catch(() => {});
  await page.goto(baseURL || "about:blank").catch(() => {});
}
