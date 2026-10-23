// The auto session's overlay: the same ring, cursor and click pulse the demo runner installs (inpage/core.ts), plus a
// small "waygraph auto" banner, and a locator theater (locator-theater.ts) that points at what the automation touches.
import type { Page } from "@playwright/test";
import type { MemPage } from "../../engine/mem/mem.js";
import { ensureShadowRoot } from "./ui/shadow.js";
import { installCore } from "./inpage/core.js";
import { clickPulseAt, moveCursorTo } from "./cursor.js";
import { hideRing } from "./rings.js";
import { setLocatorTheater } from "./locator-theater.js";
import { ignorePageGone, ignoreTimeout } from "../../engine/page-gone.js";

export async function installDemoChrome(
  page: Page,
  title = "waygraph auto",
  options: { banner?: boolean } = {},
): Promise<void> {
  const showBanner = options.banner !== false;
  await ensureShadowRoot(page);
  await page.evaluate(installCore, {}).catch(ignorePageGone);
  await page
    .evaluate(
      ({ title, showBanner }) => {
        if (showBanner && title && !__wgById("wg-banner")) {
          const banner = document.createElement("div");
          banner.id = "wg-banner";
          const tag = document.createElement("span");
          tag.className = "wg-banner-tag";
          tag.textContent = "waygraph auto";
          const text = document.createElement("span");
          text.textContent = title;
          banner.append(tag, text);
          __wgAdd(banner);
          banner.setAttribute("data-wg-ui", "1");
          banner.setAttribute("data-wg-modal", "banner");
          banner.setAttribute("data-wg-ready", "1");
        } else {
          const existing = __wgById("wg-banner");
          if (existing) {
            existing.setAttribute("data-wg-ui", "1");
            existing.setAttribute("data-wg-modal", "banner");
            existing.setAttribute("data-wg-ready", "1");
          }
        }
        if (showBanner && !document.title.startsWith("[waygraph] ")) {
          document.title = "[waygraph] " + document.title;
        }
      },
      { title, showBanner },
    )
    .catch(ignorePageGone);
}

async function showRing(page: Page, box: { x: number; y: number; width: number; height: number }, label: string) {
  await page.evaluate(({ box, label }) => window.__wgPositionRing?.(box, label, "auto"), { box, label }).catch(ignorePageGone);
}

/** Demo cursor + ring on fill/click during auto explore headful runs (automation = gray). */
export function instrumentAutoInteractions(
  page: Page,
  mem: MemPage,
  slowMo: number,
): void {
  const typeDelay = () => (slowMo ? 0 : 30);
  const clickPrePop = () => (slowMo ? 300 : 700);
  const clickPostPop = () => (slowMo ? 200 : 500);
  const cursorMs = (full: number) => full;

  const memTrack = { lastKeyName: null as string | null, at: 0 };
  const originalGet = mem.get.bind(mem);
  mem.get = (key: { name?: string }) => {
    memTrack.lastKeyName = key?.name ?? null;
    memTrack.at = Date.now();
    return originalGet(key as never);
  };

  setLocatorTheater(page, {
    async beforeFill(locator) {
      await installDemoChrome(page, "", { banner: false });
      const box = await locator.boundingBox();
      if (!box) return;
      const label = memTrack.lastKeyName && Date.now() - memTrack.at < 3000 ? "from mem: " + memTrack.lastKeyName : "writing from mem";
      await moveCursorTo(page, box, cursorMs(500));
      await showRing(page, box, label);
      await new Promise((res) => setTimeout(res, 200));
    },
    typingDelay: typeDelay,
    async afterFill() {
      await hideRing(page);
    },
    async beforeClick(locator, options) {
      await installDemoChrome(page, "", { banner: false });
      await locator.waitFor({ state: "visible", timeout: options?.timeout || 30000 }).catch(ignoreTimeout);
      const box = await locator.boundingBox();
      if (!box) return "click";
      let label = "click";
      const text = (await locator.textContent().catch(() => null))?.trim();
      if (text && text.length <= 30) label = text;
      const clickPoint = await moveCursorTo(page, box, cursorMs(600));
      await showRing(page, box, label);
      await new Promise((res) => setTimeout(res, clickPrePop()));
      if (clickPoint) {
        await clickPulseAt(page, clickPoint.x, clickPoint.y, "auto");
        await new Promise((res) => setTimeout(res, 80));
      }
      return "click";
    },
    holdMs: () => 600,
    async afterClick() {
      await new Promise((res) => setTimeout(res, clickPostPop()));
      await hideRing(page);
    },
  });
}
