// The auto session's overlay: the same ring, cursor and click pulse the demo runner installs (inpage/core.ts), plus a
// small "waygraph auto" banner, and fill/click patches that point at what the automation touches.
import type { Page } from "@playwright/test";
import type { MemPage } from "../../engine/mem/mem.js";
import { ensureShadowRoot } from "./ui/shadow.js";
import { installCore } from "./inpage/core.js";
import { clickPulseAt, moveCursorTo } from "./cursor.js";
import { hideRing } from "./rings.js";

export async function installDemoChrome(
  page: Page,
  title = "waygraph auto",
  options: { banner?: boolean } = {},
): Promise<void> {
  const showBanner = options.banner !== false;
  await ensureShadowRoot(page);
  await page.evaluate(installCore, {}).catch(() => {});
  await page
    .evaluate(
      ({ title, showBanner }) => {
        if (showBanner && title && !__wgById("wg-banner")) {
          const banner = document.createElement("div");
          banner.id = "wg-banner";
          banner.innerHTML =
            "<span class='wg-banner-tag'>waygraph auto</span><span>" + title + "</span>";
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
    .catch(() => {});
}

async function showRing(page: Page, box: { x: number; y: number; width: number; height: number }, label: string) {
  await page.evaluate(({ box, label }) => window.__wgPositionRing?.(box, label, "auto"), { box, label }).catch(() => {});
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

  const proto = Object.getPrototypeOf(page.locator("html"));

  if (!proto.__wgFillPatched) {
    proto.__wgFillPatched = true;
    const originalFill = proto.fill;
    proto.fill = async function (this: ReturnType<Page["locator"]>, value: string, options?: object) {
      try {
        await installDemoChrome(page, "", { banner: false });
        const box = await this.boundingBox();
        if (box) {
          const label =
            memTrack.lastKeyName && Date.now() - memTrack.at < 3000
              ? "from mem: " + memTrack.lastKeyName
              : "writing from mem";
          await moveCursorTo(page, box, cursorMs(500));
          await showRing(page, box, label);
          await new Promise((res) => setTimeout(res, 200));
        }
      } catch {
        /* best-effort */
      }
      let result;
      try {
        await originalFill.call(this, "", {
          timeout: (options as { timeout?: number } | undefined)?.timeout,
        });
        const seqOpts: { delay: number; timeout?: number } = { delay: typeDelay() };
        const to = (options as { timeout?: number } | undefined)?.timeout;
        if (to !== undefined) seqOpts.timeout = to;
        result = await this.pressSequentially(String(value), seqOpts);
      } catch {
        result = await originalFill.call(this, value, options);
      }
      await hideRing(page);
      return result;
    };
  }

  if (!proto.__wgClickPatched) {
    proto.__wgClickPatched = true;
    const originalClick = proto.click;
    proto.click = async function (this: ReturnType<Page["locator"]>, options?: object) {
      let clickPoint: { x: number; y: number } | null = null;
      try {
        await installDemoChrome(page, "", { banner: false });
        await this.waitFor({
          state: "visible",
          timeout: (options as { timeout?: number } | undefined)?.timeout || 30000,
        }).catch(() => {});
        const box = await this.boundingBox();
        if (box) {
          let label = "click";
          try {
            const text = (await this.textContent())?.trim();
            if (text && text.length > 0 && text.length <= 30) label = text;
          } catch {
            /* ignore */
          }
          clickPoint = await moveCursorTo(page, box, cursorMs(600));
          await showRing(page, box, label);
          await new Promise((res) => setTimeout(res, clickPrePop()));
        }
      } catch {
        /* best-effort */
      }
      if (clickPoint) {
        await clickPulseAt(page, clickPoint.x, clickPoint.y, "auto");
        await new Promise((res) => setTimeout(res, 80));
      }
      const result = await originalClick.call(this, options);
      await new Promise((res) => setTimeout(res, clickPostPop()));
      await hideRing(page);
      return result;
    };
  }
}
