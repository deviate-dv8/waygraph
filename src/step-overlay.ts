import type { Page } from "@playwright/test";
import type { MemPage } from "./mem-page.js";

const RING_CSS =
  "#wg-ring{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "border:2.5px solid #7C3AED;border-radius:10px;box-shadow:0 0 0 4px rgba(124,58,237,.16);" +
  // Opacity only - tone color must snap (no gray/purple/yellow morph).
  "transition:opacity .3s ease;}" +
  // Automation = gray; semantic tones for authored highlights.
  "#wg-ring[data-tone=planned]{border-color:#7C3AED;box-shadow:0 0 0 4px rgba(124,58,237,.16);}" +
  "#wg-ring[data-tone=auto]{border-color:#9CA3AF;box-shadow:0 0 0 4px rgba(156,163,175,.28);}" +
  "#wg-ring[data-tone=info]{border-color:#3B82F6;box-shadow:0 0 0 4px rgba(59,130,246,.22);}" +
  "#wg-ring[data-tone=warning]{border-color:#EAB308;box-shadow:0 0 0 4px rgba(234,179,8,.22);}" +
  "#wg-ring[data-tone=danger]{border-color:#EF4444;box-shadow:0 0 0 4px rgba(239,68,68,.22);}" +
  "#wg-ring[data-tone=success]{border-color:#22C55E;box-shadow:0 0 0 4px rgba(34,197,94,.22);}" +
  "#wg-ring-label{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "white-space:nowrap;padding:4px 9px;border-radius:7px;background:#7C3AED;color:#fff;" +
  "font:600 12px/1.2 system-ui,sans-serif;transition:opacity .3s ease;}" +
  "#wg-ring-label[data-tone=planned]{background:#7C3AED;color:#fff;}" +
  "#wg-ring-label[data-tone=auto]{background:#6B7280;color:#fff;}" +
  "#wg-ring-label[data-tone=info]{background:#2563EB;color:#fff;}" +
  "#wg-ring-label[data-tone=warning]{background:#EAB308;color:#1c1917;}" +
  "#wg-ring-label[data-tone=danger]{background:#DC2626;color:#fff;}" +
  "#wg-ring-label[data-tone=success]{background:#16A34A;color:#fff;}" +
  "#wg-ring[data-size=sm]{border-width:1.5px;border-radius:8px;}" +
  "#wg-ring[data-size=lg]{border-width:4px;border-radius:12px;}" +
  "#wg-ring-label[data-size=sm]{font-size:10px;line-height:1.25;padding:4px 7px;border-radius:5px;}" +
  "#wg-ring-label[data-size=lg]{font-size:16px;line-height:1.35;padding:8px 14px;border-radius:9px;}" +
  "#wg-ring-label[data-weight=bold]{font-weight:800;}" +
  "#wg-ring-label[data-weight=normal]{font-weight:600;}" +
  "#wg-cursor{position:fixed;z-index:2147483647;width:24px;height:24px;pointer-events:none;" +
  "left:0;top:0;opacity:0;margin:0;" +
  "transition:transform var(--wg-cursor-ms,600ms) cubic-bezier(.22,1,.36,1),opacity .2s ease;" +
  "filter:drop-shadow(0 2px 4px rgba(12,12,26,.4));}" +
  "#wg-click-pulse{position:fixed;z-index:2147483647;width:14px;height:14px;" +
  "margin-left:-7px;margin-top:-7px;border-radius:50%;pointer-events:none;opacity:0;" +
  "border:2px solid #7C3AED;background:rgba(124,58,237,.25);}" +
  "#wg-click-pulse[data-tone=auto]{border-color:#9CA3AF;background:rgba(156,163,175,.28);}" +
  "#wg-click-pulse[data-tone=info]{border-color:#3B82F6;background:rgba(59,130,246,.28);}" +
  "#wg-click-pulse[data-tone=warning]{border-color:#EAB308;background:rgba(234,179,8,.28);}" +
  "#wg-click-pulse[data-tone=danger]{border-color:#EF4444;background:rgba(239,68,68,.28);}" +
  "#wg-click-pulse[data-tone=success]{border-color:#22C55E;background:rgba(34,197,94,.28);}" +
  "#wg-click-pulse.wg-pulse{animation:wg-pulse .5s ease-out;}" +
  "@keyframes wg-pulse{0%{opacity:.9;transform:scale(.4);}100%{opacity:0;transform:scale(2.4);}}" +
  "#wg-banner{position:fixed;z-index:2147483647;top:14px;left:14px;" +
  "background:rgba(20,10,40,.94);color:#fff;border-radius:12px;padding:10px 16px;" +
  "font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.3);" +
  "border:1px solid rgba(124,58,237,.4);}" +
  "#wg-banner .wg-banner-tag{display:block;font-size:10px;font-weight:700;color:#c9a6ff;" +
  "letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px;}";

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
  await page.addStyleTag({ content: RING_CSS }).catch(() => {});
  await page
    .evaluate(
      ({ title, favicon, showBanner }) => {
        if (!document.getElementById("wg-ring")) {
          const ring = document.createElement("div");
          ring.id = "wg-ring";
          document.documentElement.appendChild(ring);
        }
        if (!document.getElementById("wg-ring-label")) {
          const ringLabel = document.createElement("div");
          ringLabel.id = "wg-ring-label";
          document.documentElement.appendChild(ringLabel);
        }
        if (!document.getElementById("wg-cursor")) {
          const cursor = document.createElement("div");
          cursor.id = "wg-cursor";
          cursor.innerHTML =
            "<svg viewBox='0 0 32 32' width='24' height='24'>" +
            "<path fill='#0C0C1A' stroke='#fff' stroke-width='1.4' stroke-linejoin='round' " +
            "d='M6 3.5l1.4 22.5 5.8-5.4 4.2 9.4 3.6-1.6-4.2-9.2H26z'/></svg>";
          document.documentElement.appendChild(cursor);
        }
        if (!document.getElementById("wg-click-pulse")) {
          const pulse = document.createElement("div");
          pulse.id = "wg-click-pulse";
          document.documentElement.appendChild(pulse);
        }
        window.__wgMoveCursorTo = (x: number, y: number, ms?: number) => {
          const cursor = document.getElementById("wg-cursor");
          if (!cursor) return;
          cursor.style.setProperty("--wg-cursor-ms", (ms || 600) + "ms");
          cursor.style.transform = "translate(" + x + "px," + y + "px)";
          cursor.style.opacity = "1";
        };
        window.__wgClickPulse = (x: number, y: number, tone?: string) => {
          const pulse = document.getElementById("wg-click-pulse");
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
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
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
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (ring) ring.style.opacity = "0";
          if (ringLabel) ringLabel.style.opacity = "0";
        };
        if (showBanner && title && !document.getElementById("wg-banner")) {
          const banner = document.createElement("div");
          banner.id = "wg-banner";
          banner.innerHTML =
            "<span class='wg-banner-tag'>waygraph auto</span><span>" + title + "</span>";
          document.documentElement.appendChild(banner);
          banner.setAttribute("data-wg-ui", "1");
          banner.setAttribute("data-wg-modal", "banner");
          banner.setAttribute("data-wg-ready", "1");
        } else {
          const existing = document.getElementById("wg-banner");
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
