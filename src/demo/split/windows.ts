// `--split windows`: a flow's panes in real browser windows, side by side across the screen, for watching live and
// clicking into. Each pane's window is placed when it opens (Chrome DevTools Protocol `Browser.setWindowBounds`).
import type { Browser, Page } from "@playwright/test";
import type { PaneHost } from "../../engine/run/pane-page.js";

/** A host that opens each pane named in a window of its own, in `browser`, the screen split between them. */
export async function windowsHost(screenOf: Page, panes: readonly string[], browser: Browser): Promise<PaneHost> {
  const area = await screenOf.evaluate(() => ({ width: window.screen.availWidth, height: window.screen.availHeight }));
  const width = Math.floor(area.width / Math.max(1, panes.length));
  return {
    browser,
    viewport: () => ({ width, height: area.height }),
    // The page fills its window, as a person's would.
    contextOptions: () => ({ viewport: null }),
    async opened(pane, page) {
      const cdp = await page.context().newCDPSession(page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      const left = Math.max(0, panes.indexOf(pane)) * width;
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left, top: 0, width, height: area.height, windowState: "normal" } });
      await cdp.detach();
    },
    acting() {},
  };
}
