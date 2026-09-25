// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { resolveDeviceState } from "../highlights.js";

/**
 * Fit + center the OS browser window on the device viewport so mobile/tablet
 * is not stuck top-left inside a maximized frame (Dan 0.13.4).
 * Desktop clear restores maximized.
 */
async function fitWindowToDeviceViewport(page, viewport, opts) {
  const maximize = !!(opts && opts.maximize);
  let client;
  try {
    client = await page.context().newCDPSession(page);
    const { windowId } = await client.send("Browser.getWindowForTarget");
    if (maximize) {
      await client.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "maximized" },
      });
      return;
    }
    if (!viewport || !viewport.width || !viewport.height) return;
    const metrics = await page
      .evaluate(() => {
        const chromeW = Math.max(0, (window.outerWidth || 0) - (window.innerWidth || 0));
        const chromeH = Math.max(0, (window.outerHeight || 0) - (window.innerHeight || 0));
        return {
          chromeW: Number.isFinite(chromeW) ? chromeW : 0,
          // First paint after maximize often reports 0 chrome - use a floor.
          chromeH: chromeH > 20 ? chromeH : 88,
          screenW: window.screen.availWidth || 1920,
          screenH: window.screen.availHeight || 1080,
        };
      })
      .catch(() => ({ chromeW: 0, chromeH: 88, screenW: 1920, screenH: 1080 }));
    // Leave maximized before setting pixel bounds (Chromium ignores size while max).
    await client.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "normal" },
    });
    const winW = Math.min(
      metrics.screenW,
      Math.max(320, Math.floor(viewport.width + metrics.chromeW)),
    );
    const winH = Math.min(
      metrics.screenH,
      Math.max(320, Math.floor(viewport.height + metrics.chromeH)),
    );
    const left = Math.max(0, Math.floor((metrics.screenW - winW) / 2));
    const top = Math.max(0, Math.floor((metrics.screenH - winH) / 2));
    await client.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        windowState: "normal",
        left,
        top,
        width: winW,
        height: winH,
      },
    });
  } catch {
    /* headless / no window - ignore */
  } finally {
    if (client) await client.detach().catch(() => {});
  }
}


/**
 * Video recording locks Playwright viewport to recordVideo.size. Shrinking
 * setViewportSize to mobile/tablet letterboxes the .webm top-left. Instead keep
 * the stage size and center a device-sized #wg-device-shell inside the frame.
 */
export async function applyVideoDeviceStage(page, target, stage, opts) {
  const clear = !!(opts && opts.clear);
  const shutterOut = !!(opts && opts.shutterOut);
  const enterIn = !!(opts && opts.enterIn);
  const desktopFlat = !!(opts && (opts.desktopFlat || opts.shutterOut));
  const result = await page
    .evaluate(
      ({ tw, th, sw, sh, clear, shutterOut, enterIn, desktopFlat }) => {
        const MATTE = "#0b1220";
        const unwrap = () => {
          const shell = document.getElementById("wg-device-shell");
          if (shell) {
            const parent = shell.parentNode;
            if (parent) {
              while (shell.firstChild) parent.insertBefore(shell.firstChild, shell);
            }
            shell.remove();
          }
          document.documentElement.classList.remove("wg-video-device-stage");
          document.documentElement.style.removeProperty("background");
          const b = document.body;
          if (b) {
            b.style.margin = "";
            b.style.minHeight = "";
            b.style.display = "";
            b.style.alignItems = "";
            b.style.justifyContent = "";
            b.style.background = "";
            b.style.overflow = "";
          }
        };
        if (clear) {
          unwrap();
          return { waitMs: 0 };
        }
        if (!document.body) return { waitMs: 0 };
        document.documentElement.classList.add("wg-video-device-stage");
        document.documentElement.style.background = MATTE;
        document.body.style.margin = "0";
        document.body.style.minHeight = "100vh";
        document.body.style.display = "flex";
        document.body.style.alignItems = "center";
        document.body.style.justifyContent = "center";
        document.body.style.background = MATTE;
        document.body.style.overflow = "hidden";

        let shell = document.getElementById("wg-device-shell");
        const created = !shell;
        if (!shell) {
          shell = document.createElement("div");
          shell.id = "wg-device-shell";
          const move = [];
          for (const child of [...document.body.childNodes]) {
            if (
              child.nodeType === 1 &&
              child.getAttribute &&
              child.getAttribute("data-wg-ui") === "1"
            ) {
              continue;
            }
            if (child.nodeType === 1 && child.id === "wg-device-shell") continue;
            move.push(child);
          }
          for (const n of move) shell.appendChild(n);
          document.body.appendChild(shell);
        }
        // Desktop flat: always full-bleed, never reintroduce bezel on overlay rebuild.
        if (desktopFlat) {
          shell.classList.remove("wg-shell-enter");
          shell.classList.add("wg-shell-shutter-out");
          shell.classList.add("wg-shell-desktop-flat");
          shell.style.width = sw + "px";
          shell.style.height = sh + "px";
          shell.style.maxWidth = sw + "px";
          shell.style.maxHeight = sh + "px";
          shell.style.transform = "scale(1)";
          shell.style.transformOrigin = "center center";
          shell.style.borderRadius = "0";
          shell.style.boxShadow = "none";
          shell.style.border = "none";
          shell.style.outline = "none";
          return { waitMs: shutterOut ? 480 : 0 };
        }
        // Leaving desktop-flat: clear INLINE radius/shadow overrides so CSS
        // border-radius:16px applies evenly on all corners again.
        shell.style.removeProperty("border-radius");
        shell.style.removeProperty("box-shadow");
        shell.style.removeProperty("border");
        shell.style.removeProperty("outline");
        if (enterIn && (created || shell.classList.contains("wg-shell-shutter-out"))) {
          shell.classList.remove("wg-shell-shutter-out");
          shell.classList.remove("wg-shell-desktop-flat");
          shell.classList.add("wg-shell-enter");
          void shell.offsetWidth;
        }
        const scale = Math.min(sw / tw, sh / th) * 0.92;
        shell.style.width = tw + "px";
        shell.style.height = th + "px";
        shell.style.maxWidth = tw + "px";
        shell.style.maxHeight = th + "px";
        shell.style.transform = "scale(" + scale + ")";
        shell.style.transformOrigin = "center center";
        shell.classList.remove("wg-shell-shutter-out");
        shell.classList.remove("wg-shell-desktop-flat");
        if (enterIn && shell.classList.contains("wg-shell-enter")) {
          requestAnimationFrame(() => {
            shell.classList.remove("wg-shell-enter");
          });
          return { waitMs: 520 };
        }
        shell.classList.remove("wg-shell-enter");
        return { waitMs: 0 };
      },
      {
        tw: target.width,
        th: target.height,
        sw: stage.width,
        sh: stage.height,
        clear,
        shutterOut,
        enterIn,
        desktopFlat,
      },
    )
    .catch(() => ({ waitMs: 0 }));
  const waitMs = result && result.waitMs ? Number(result.waitMs) : 0;
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
}


/**
 * Apply authored device fixture to the live page (0.13+).
 * Seamless viewport lerp + centered window + toast on set/clear.
 * With --video: keep recordVideo stage size and center a device shell in-frame.
 */
export async function applyDeviceToPage(page, device, sync) {
  const mode = sync || (device ? "set" : "keep");
  if (mode === "keep" && !device) return;
  const d =
    device ||
    resolveDeviceState("desktop", false) || {
      preset: "desktop",
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      isMobile: false,
      hasTouch: false,
      touchMode: false,
    };
  const realSet =
    typeof page.__wgRealSetViewportSize === "function"
      ? page.__wgRealSetViewportSize
      : page.setViewportSize.bind(page);
  const target = {
    width: Math.max(200, Math.floor(d.viewport.width)),
    height: Math.max(200, Math.floor(d.viewport.height)),
  };
  const videoStage =
    page.__wgVideoViewport &&
    page.__wgVideoViewport.width > 0 &&
    page.__wgVideoViewport.height > 0
      ? {
          width: Math.floor(page.__wgVideoViewport.width),
          height: Math.floor(page.__wgVideoViewport.height),
        }
      : null;
  let from = null;
  try {
    from = page.viewportSize();
  } catch {
    from = null;
  }
  const announce = mode === "set" || mode === "clear";
  const toDesktop =
    mode === "clear" || (d.preset === "desktop" && !d.touchMode);
  const shouldAnimate =
    announce &&
    from &&
    from.width > 0 &&
    from.height > 0 &&
    (from.width !== target.width || from.height !== target.height);

  // Always clear camera zoom when returning to desktop (video + headed).
  if (toDesktop) {
    page.__wgDesktopFlat = true;
    await page
      .evaluate(() => {
        window.__wgZoomOutOnHide = true;
        if (window.__wgClearZoom) window.__wgClearZoom();
      })
      .catch(() => {});
  } else if (announce) {
    page.__wgDesktopFlat = false;
  }

  // Swipe trail is for scrolling (see ensureLocatorInView), not device morph.
  const nextOrient =
    d.orientation === "landscape" || d.orientation === "portrait"
      ? d.orientation
      : target.height > target.width
        ? "portrait"
        : "landscape";
  page.__wgDeviceOrient = nextOrient;
  page.__wgDevicePreset = toDesktop ? "desktop" : d.preset || "";

  if (videoStage) {
    // Lock Playwright viewport to the recordVideo size so frames fill the
    // .webm; center the device shell inside (OS window centering alone does not).
    // Do NOT fitWindow to the device size - that shrinks the viewport below the
    // recordVideo canvas and Playwright pads the .webm with grey (top-left bias).
    try {
      await realSet(videoStage);
    } catch {
      /* ignore */
    }
    const shellFrom = page.__wgDeviceShell || target;
    if (toDesktop) {
      // Zoom already cleared above. Full-bleed desktop shell (no matte frame).
      // Shutter-out: soft rounded -> radius 0, then flat edge-to-edge.
      const desk = {
        width: videoStage.width,
        height: videoStage.height,
      };
      page.__wgDeviceShell = { ...desk };
      await applyVideoDeviceStage(page, desk, videoStage, {
        clear: false,
        shutterOut: true,
        desktopFlat: true,
      });
      try {
        await realSet(videoStage);
      } catch {
        /* ignore */
      }
    } else {
      // Lerp shell size when switching mobile <-> tablet mid-video.
      const firstDevice = !page.__wgDeviceShell;
      if (
        announce &&
        shellFrom &&
        (shellFrom.width !== target.width || shellFrom.height !== target.height)
      ) {
        const steps = 14;
        const ms = Number(process.env.WAYGRAPH_DEVICE_TRANSITION_MS || 520);
        const stepMs = Math.max(12, Math.floor(ms / steps));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const e = t * t * (3 - 2 * t);
          const mid = {
            width: Math.round(shellFrom.width + (target.width - shellFrom.width) * e),
            height: Math.round(shellFrom.height + (target.height - shellFrom.height) * e),
          };
          await applyVideoDeviceStage(page, mid, videoStage, {
            clear: false,
            enterIn: i === 1 && firstDevice,
          });
          if (i < steps) await new Promise((r) => setTimeout(r, stepMs));
        }
      } else {
        await applyVideoDeviceStage(page, target, videoStage, {
          clear: false,
          enterIn: firstDevice || announce,
        });
      }
      page.__wgDeviceShell = { ...target };
      // Re-assert stage size after any prior non-video fitWindow.
      try {
        await realSet(videoStage);
      } catch {
        /* ignore */
      }
    }
  } else {
    // Unmaximize + center early so the lerp does not sit in the corner of a
    // maximized frame. Desktop clear maximizes at the end instead.
    if (!toDesktop) {
      await fitWindowToDeviceViewport(page, from && from.width ? from : target, {
        maximize: false,
      });
    }

    try {
      if (shouldAnimate) {
        const steps = 14;
        const ms = Number(process.env.WAYGRAPH_DEVICE_TRANSITION_MS || 520);
        const stepMs = Math.max(12, Math.floor(ms / steps));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const e = t * t * (3 - 2 * t); // smoothstep
          const mid = {
            width: Math.round(from.width + (target.width - from.width) * e),
            height: Math.round(from.height + (target.height - from.height) * e),
          };
          await realSet(mid);
          if (!toDesktop && (i === 1 || i === steps || i % 3 === 0)) {
            await fitWindowToDeviceViewport(page, mid, { maximize: false });
          }
          if (i < steps) await new Promise((r) => setTimeout(r, stepMs));
        }
      } else {
        await realSet(target);
      }
    } catch {
      /* maximized / null viewport hosts may reject - toast still updates */
    }

    if (toDesktop) {
      await fitWindowToDeviceViewport(page, target, { maximize: true });
    } else {
      await fitWindowToDeviceViewport(page, target, { maximize: false });
    }
  }

  // Fire toast near the end of the lerp so it reads as one seamless beat.
  await page
    .evaluate(
      (payload) => {
        if (window.__wgSyncDevice) window.__wgSyncDevice(payload);
      },
      {
        sync: mode,
        device: d,
        remain: mode === "keep" || mode === "set",
        announce,
      },
    )
    .catch(() => {});
}
