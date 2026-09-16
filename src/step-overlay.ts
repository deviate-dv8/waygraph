import type { Page } from "@playwright/test";
import type { MemPage } from "./mem-page.js";

const RING_CSS =
  "#wg-ring{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "border:2.5px solid #7C3AED;border-radius:10px;box-shadow:0 0 0 4px rgba(124,58,237,.16);transition:opacity .3s ease;}" +
  "#wg-ring-label{position:fixed;z-index:2147483646;pointer-events:none;opacity:0;" +
  "white-space:nowrap;padding:4px 9px;border-radius:7px;background:#7C3AED;color:#fff;" +
  "font:600 12px/1.2 system-ui,sans-serif;transition:opacity .3s ease;}" +
  "#wg-cursor{position:fixed;z-index:2147483647;width:24px;height:24px;pointer-events:none;" +
  "left:0;top:0;opacity:0;margin:0;" +
  "transition:transform var(--wg-cursor-ms,600ms) cubic-bezier(.22,1,.36,1),opacity .2s ease;" +
  "filter:drop-shadow(0 2px 4px rgba(12,12,26,.4));}" +
  "#wg-click-pulse{position:fixed;z-index:2147483647;width:14px;height:14px;" +
  "margin-left:-7px;margin-top:-7px;border-radius:50%;pointer-events:none;opacity:0;" +
  "border:2px solid #7C3AED;background:rgba(124,58,237,.25);}" +
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
      ({ title, favicon }) => {
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
        window.__wgClickPulse = (x: number, y: number) => {
          const pulse = document.getElementById("wg-click-pulse");
          if (!pulse) return;
          pulse.style.left = x + "px";
          pulse.style.top = y + "px";
          pulse.classList.remove("wg-pulse");
          void pulse.offsetWidth;
          pulse.classList.add("wg-pulse");
        };
        window.__wgPositionRing = (box: { x: number; y: number; width: number; height: number }, label: string) => {
          const ring = document.getElementById("wg-ring");
          const ringLabel = document.getElementById("wg-ring-label");
          if (!ring || !ringLabel) return;
          ring.style.left = box.x - 6 + "px";
          ring.style.top = box.y - 6 + "px";
          ring.style.width = box.width + 12 + "px";
          ring.style.height = box.height + 12 + "px";
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

async function showRing(page: Page, box: { x: number; y: number; width: number; height: number }, label: string) {
  await page.evaluate(({ box, label }) => window.__wgPositionRing?.(box, label), { box, label }).catch(() => {});
}

async function hideRing(page: Page) {
  await page.evaluate(() => window.__wgHideRing?.()).catch(() => {});
}

async function clickPulseAt(page: Page, x: number, y: number) {
  await page.evaluate(({ x, y }) => window.__wgClickPulse?.(x, y), { x, y }).catch(() => {});
}

/** Demo cursor + ring on fill/click during auto explore headful runs. */
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
  mem.get = (key) => {
    memTrack.lastKeyName = key?.name ?? null;
    memTrack.at = Date.now();
    return originalGet(key);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Object.getPrototypeOf(page.locator("html")) as any;

  if (!proto.__wgFillPatched) {
    proto.__wgFillPatched = true;
    // Keep unbound — originalFill.call(this, …) must receive the Locator as `this`, not the prototype.
    const originalFill = proto.fill;
    proto.fill = async function (
      this: {
        boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
        pressSequentially: (v: string, o?: { delay?: number; timeout?: number }) => Promise<void>;
        page?: () => Page;
      },
      value: string,
      options?: { timeout?: number },
    ) {
      const livePage = (typeof this.page === "function" ? this.page() : page) as Page;
      try {
        await installDemoChrome(livePage);
        const box = await this.boundingBox();
        if (box) {
          const label =
            memTrack.lastKeyName && Date.now() - memTrack.at < 3000
              ? "from mem: " + memTrack.lastKeyName
              : "writing";
          await moveCursorTo(livePage, box, cursorMs(500));
          await showRing(livePage, box, label);
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        /* best-effort */
      }
      // Prefer a single fill - clear+pressSequentially can hang when the auto
      // panel steals focus mid-type (looks stuck on "Running: submit-login").
      if (slowMo || typeDelay() === 0) {
        await originalFill.call(this, value, options);
      } else {
        try {
          await originalFill.call(this, "", options);
          const seqOpts: { delay: number; timeout?: number } = { delay: typeDelay() };
          if (options?.timeout !== undefined) seqOpts.timeout = options.timeout;
          await this.pressSequentially(String(value), seqOpts);
        } catch {
          await originalFill.call(this, value, options);
        }
      }
      await hideRing(livePage);
    };
  }

  if (!proto.__wgClickPatched) {
    proto.__wgClickPatched = true;
    const originalClick = proto.click;
    proto.click = async function (
      this: {
        waitFor: (o: { state: string; timeout?: number }) => Promise<void>;
        boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
        textContent: () => Promise<string | null>;
        page?: () => Page;
      },
      options?: { timeout?: number; noWaitAfter?: boolean },
    ) {
      const livePage = (typeof this.page === "function" ? this.page() : page) as Page;
      let clickPoint: { x: number; y: number } | null = null;
      try {
        await installDemoChrome(livePage);
        await this.waitFor({ state: "visible", timeout: options?.timeout ?? 15000 }).catch(() => {});
        const box = await this.boundingBox();
        if (box) {
          let label = "click";
          try {
            const navLabel = await livePage.evaluate(
              () => (window as { __wgPendingNavClickLabel?: string }).__wgPendingNavClickLabel ?? null,
            );
            if (navLabel) label = String(navLabel);
            else {
              const text = (await this.textContent())?.trim();
              if (text && text.length <= 30) label = text;
            }
          } catch {
            /* ignore */
          }
          clickPoint = await moveCursorTo(livePage, box, cursorMs(600));
          await showRing(livePage, box, label);
          await new Promise((r) => setTimeout(r, clickPrePop()));
        }
      } catch {
        /* best-effort */
      }
      if (clickPoint) {
        await clickPulseAt(livePage, clickPoint.x, clickPoint.y);
        await new Promise((r) => setTimeout(r, 200));
      }
      const result = await originalClick.call(this, options);
      await new Promise((r) => setTimeout(r, clickPostPop()));
      await hideRing(livePage).catch(() => {});
      return result;
    };
  }
}

declare global {
  interface Window {
    __wgMoveCursorTo?: (x: number, y: number, ms?: number) => void;
    __wgClickPulse?: (x: number, y: number) => void;
    __wgPositionRing?: (box: { x: number; y: number; width: number; height: number }, label: string) => void;
    __wgHideRing?: () => void;
    __wgPendingNavClickLabel?: string;
    __wgWirePanelChrome?: (panel: HTMLElement, storageKey: string, chromeTitle?: string) => void;
  }
}
