import type { Page } from "@playwright/test";
import type { MemPage } from "./mem-page.js";
import { ensureShadowRoot } from "./ui/shadow.js";

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='#7C3AED'/></svg>",
  );

export async function installDemoChrome(
  page: Page,
  title = "waygraph auto",
  options: { banner?: boolean } = {},
): Promise<void> {
  const showBanner = options.banner !== false;
  // ring/cursor/banner CSS comes from the one shared bundle - see ui/css/README.md.
  await ensureShadowRoot(page);
  await page
    .evaluate(
      ({ title, favicon, showBanner }) => {
        if (!__wgById("wg-ring")) {
          const ring = document.createElement("div");
          ring.id = "wg-ring";
          __wgAdd(ring);
        }
        if (!__wgById("wg-ring-label")) {
          const ringLabel = document.createElement("div");
          ringLabel.id = "wg-ring-label";
          __wgAdd(ringLabel);
        }
        if (!__wgById("wg-cursor")) {
          const cursor = document.createElement("div");
          cursor.id = "wg-cursor";
          cursor.innerHTML =
            "<svg viewBox='0 0 32 32' width='24' height='24'>" +
            "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
            "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
          __wgAdd(cursor);
        }
        if (!__wgById("wg-click-pulse")) {
          const pulse = document.createElement("div");
          pulse.id = "wg-click-pulse";
          __wgAdd(pulse);
        }
        window.__wgMoveCursorTo = (x: number, y: number, ms?: number) => {
          const cursor = __wgById("wg-cursor");
          if (!cursor) return;
          cursor.style.setProperty("--wg-cursor-ms", (ms || 600) + "ms");
          cursor.style.transform = "translate(" + x + "px," + y + "px)";
          cursor.style.opacity = "1";
        };
        window.__wgClickPulse = (x: number, y: number, tone?: string) => {
          const pulse = __wgById("wg-click-pulse");
          if (!pulse) return;
          const raw = (tone || "planned") + "";
          pulse.dataset.tone =
            raw === "auto" ||
            raw === "info" ||
            raw === "warning" ||
            raw === "danger" ||
            raw === "success"
              ? raw
              : "planned";
          pulse.style.left = x + "px";
          pulse.style.top = y + "px";
          pulse.classList.remove("wg-pulse");
          void pulse.offsetWidth;
          pulse.classList.add("wg-pulse");
        };
        window.__wgPositionRing = (
          box: { x: number; y: number; width: number; height: number },
          label: string,
          tone?: string,
          style?: { size?: string; weight?: string },
        ) => {
          const ring = __wgById("wg-ring");
          const ringLabel = __wgById("wg-ring-label");
          if (!ring || !ringLabel) return;
          const raw = (tone || "planned") + "";
          const t =
            raw === "auto" ||
            raw === "info" ||
            raw === "warning" ||
            raw === "danger" ||
            raw === "success"
              ? raw
              : "planned";
          const sizeRaw = ((style && style.size) || "md") + "";
          const size = sizeRaw === "sm" || sizeRaw === "lg" ? sizeRaw : "md";
          const weightRaw = ((style && style.weight) || "normal") + "";
          const weight = weightRaw === "bold" ? "bold" : "normal";
          ring.dataset.tone = t;
          ringLabel.dataset.tone = t;
          ring.dataset.size = size;
          ringLabel.dataset.size = size;
          ringLabel.dataset.weight = weight;
          const pad = size === "sm" ? 3 : size === "lg" ? 10 : 6;
          ring.style.left = box.x - pad + "px";
          ring.style.top = box.y - pad + "px";
          ring.style.width = box.width + pad * 2 + "px";
          ring.style.height = box.height + pad * 2 + "px";
          ring.style.opacity = "1";
          ringLabel.textContent = label;
          ringLabel.style.left = box.x + "px";
          ringLabel.style.top = box.y + box.height + 8 + "px";
          ringLabel.style.opacity = "1";
        };
        window.__wgHideRing = () => {
          const ring = __wgById("wg-ring");
          const ringLabel = __wgById("wg-ring-label");
          if (ring) ring.style.opacity = "0";
          if (ringLabel) ringLabel.style.opacity = "0";
        };
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
      { title, favicon: FAVICON, showBanner },
    )
    .catch(() => {});
}

async function moveCursorTo(page: Page, box: { x: number; y: number; width: number; height: number }, ms: number) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(({ x, y, ms }) => window.__wgMoveCursorTo?.(x, y, ms), { x, y, ms }).catch(() => {});
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  return { x, y };
}

async function showRing(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  label: string,
  tone: string = "auto",
) {
  await page
    .evaluate(({ box, label, tone }) => window.__wgPositionRing?.(box, label, tone), {
      box,
      label,
      tone,
    })
    .catch(() => {});
}

async function hideRing(page: Page) {
  await page.evaluate(() => window.__wgHideRing?.()).catch(() => {});
}

async function clickPulseAt(page: Page, x: number, y: number, tone: string = "auto") {
  await page
    .evaluate(({ x, y, tone }) => window.__wgClickPulse?.(x, y, tone), { x, y, tone })
    .catch(() => {});
}

/** Demo cursor + ring on fill/click during auto explore headful runs (automation = gray). */
export function instrumentInteractionHighlighting(
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
          await showRing(page, box, label, "auto");
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
          await showRing(page, box, label, "auto");
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

declare global {
  interface Window {
    __wgMoveCursorTo?: (x: number, y: number, ms?: number) => void;
    __wgClickPulse?: (x: number, y: number, tone?: string) => void;
    __wgPositionRing?: (
      box: { x: number; y: number; width: number; height: number },
      label: string,
      tone?: string,
    ) => void;
    __wgHideRing?: () => void;
    __wgPendingNavClickLabel?: string;
    __wgWirePanelChrome?: (panel: HTMLElement, storageKey: string, chromeTitle?: string) => void;
    __wgStampModal?: (
      el: Element,
      kind: string,
      meta?: Record<string, unknown>,
    ) => void;
    __wgOverlayBeacon?: () => Array<{
      id: string | null;
      modal: string | null;
      ready: boolean;
      phase: string | null;
      step: string | null;
      block: string | null;
      collapsed: boolean;
      opacity: string;
      textLen: number;
      w: number;
      h: number;
      visible: boolean;
    }>;
  }
}
