// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { HOST_CSS, RUNNER_EXTRA_CSS, WAYGRAPH_FAVICON } from "./overlay-css.js";
import { ensureShadowRoot } from "../ui/shadow.js";
import { resolveTodoDockUi } from "../highlights.js";
import { installCore } from "./inpage/core.js";
import { installSwipeZoom } from "./inpage/swipe-zoom.js";
import { installBanner } from "./inpage/banner.js";
import { installStamp } from "./inpage/stamp.js";
import { installPanelChrome } from "./inpage/panel-chrome.js";
import { installTodos } from "./inpage/todos.js";
import { installDevice } from "./inpage/device.js";
import { applyVideoDeviceStage } from "./device-stage.js";

/** `ui` = authored banner UX from the stub phase: { pos, collision, hidden } (all optional). */
export async function installOverlay(page, title, ui) {
  // ring/cursor/banner/dock come from the ONE shared bundle every surface installs (ui/css/*.css).
  await ensureShadowRoot(page);
  // Runner-only chrome (step panel, zoom/typing/device chips) - separate key, no collision.
  await page.evaluate(([css, key]) => __wgCss(css, key), [RUNNER_EXTRA_CSS, "wg-runner-css"]).catch(() => {});
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
