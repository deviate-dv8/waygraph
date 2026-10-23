// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import type { WgPage } from "../types.js";
import { HOST_CSS, RUNNER_EXTRA_CSS, WAYGRAPH_FAVICON } from "./overlay-css.js";
import { ensureShadowRoot } from "../../ui/shadow.js";
import { resolveTodoDockUi } from "../narration/index.js";
import { installCore } from "./inpage/core.js";
import { installSwipeZoom } from "./inpage/swipe-zoom.js";
import { installBanner } from "./inpage/banner.js";
import { showCaption, hideCaption } from "./inpage/caption.js";
import { installStamp } from "./inpage/stamp.js";
import { installPanelChrome } from "./inpage/panel-chrome.js";
import { installTodos } from "./inpage/todos.js";
import { installDevice } from "./inpage/device.js";
import { applyVideoDeviceStage } from "./device-stage.js";
import { installNetworkCapture, restoreNetworkHistory } from "./network-capture.js";
import { setNetworkTabVisible } from "./inpage/network.js";

/**
 * `ui` = authored banner UX from the stub phase: { pos, collision, hidden } (all optional).
 * `caption` = bottom subtitle-bar text (ctx.caption()/ctx.hideCaption()) - `undefined` leaves it
 * alone (unset this step), `""` hides it, any other string shows/updates it.
 * `networkTabVisible` = network-tab panel shown/hidden (ctx.showNetworkTab()/hideNetworkTab()) -
 * `undefined` leaves it alone (default state is hidden, set the very first time restoreNetworkHistory
 * builds a panel); capture itself is unconditional and unaffected by this either way.
 */
export async function installOverlay(page: WgPage, title?: any, ui?: any, caption?: any, networkTabVisible?: any) {
  // ring/cursor/banner/dock come from the ONE shared bundle every surface installs (ui/css/*.css).
  await ensureShadowRoot(page);
  // Idempotent (guarded on page.__wgNetworkCaptureInstalled) - safe to call every step even though
  // installOverlay itself runs every step; the page.on() listeners this installs are attached to
  // the Page object, not any one document, so they already survive navigations on their own.
  installNetworkCapture(page);
  // Visibility is Node-side state too (page.__wgNetworkTabVisible), same reason history is: a
  // navigation wipes window.__wgNetworkTabVisible along with the rest of the page-side JS state,
  // so "shown" would silently revert to the hidden default on the very next navigated step without
  // this. Default false (hidden) - matches addNetworkEntry's own default-hidden behavior.
  if (networkTabVisible !== undefined) page.__wgNetworkTabVisible = !!networkTabVisible;
  await page.evaluate((v: any) => { window.__wgNetworkTabVisible = v; }, !!page.__wgNetworkTabVisible).catch(() => {});
  // Real bug this fixes: a navigation wipes the shadow root (and with it, the network panel's DOM
  // and in-page entry list) - without replaying page.__wgNetworkHistory (Node-side, survives
  // navigation) back in every step, the "network tab" silently reset to empty on any step that
  // navigated, instead of staying persistent like a real Network tab.
  await restoreNetworkHistory(page);
  // Explicit toggle too, not just the flag write above - covers the case where the panel already
  // existed (no restore ran this step) and this step's `networkTabVisible` differs from before.
  if (networkTabVisible !== undefined) {
    await page.evaluate(setNetworkTabVisible, networkTabVisible).catch(() => {});
  }
  // Runner-only chrome (step panel, zoom/typing/device chips) - separate key, no collision.
  await page.evaluate(([css, key]) => __wgCss(css, key), [RUNNER_EXTRA_CSS, "wg-runner-css"] as const).catch(() => {});
  await page.addStyleTag({ content: HOST_CSS }).catch(() => {});
  // Default top-left; override with WAYGRAPH_TITLE_POS=left|center|right.
  // Click cycles left -> center -> right (persisted in localStorage so a
  // navigation that rebuilds the banner keeps the human's last pick).
  const envPos = (process.env.WAYGRAPH_TITLE_POS || "left").toLowerCase();
  const bannerPos = envPos === "center" || envPos === "right" ? envPos : "left";
  const envTodoPos = (process.env.WAYGRAPH_TODO_POS || "left").toLowerCase();
  const todoPos = envTodoPos === "right" ? "right" : "left";
  const envAutoplay = process.env.WAYGRAPH_AUTOPLAY === "1";
  const todoDockUi = resolveTodoDockUi();
  const args = { title, favicon: WAYGRAPH_FAVICON, bannerPos, todoPos, envAutoplay, todoDockUi, bannerUi: ui || null };
  await page.evaluate(installCore, args).catch(() => {});
  await page.evaluate(installSwipeZoom, args).catch(() => {});
  await page.evaluate(installBanner, args).catch(() => {});
  await page.evaluate(installStamp, args).catch(() => {});
  await page.evaluate(installPanelChrome, args).catch(() => {});
  await page.evaluate(installTodos, args).catch(() => {});
  await page.evaluate(installDevice, args).catch(() => {});
  if (caption !== undefined) {
    if (caption === "") {
      await page.evaluate(hideCaption).catch(() => {});
    } else {
      await page.evaluate(showCaption, caption).catch(() => {});
    }
  }
  // Navigations wipe #wg-device-shell - rebuild when video stage + device are live.
  // If we already shuttered to desktop-flat, re-apply FLAT (never re-add bezel).
  if (
    page.__wgVideoViewport &&
    page.__wgDeviceShell &&
    page.__wgDeviceShell.width &&
    page.__wgDeviceShell.height
  ) {
    await applyVideoDeviceStage(page, page.__wgDeviceShell, page.__wgVideoViewport, {
      clear: false,
      shutterOut: !!page.__wgDesktopFlat,
      desktopFlat: !!page.__wgDesktopFlat,
    });
  }
}
