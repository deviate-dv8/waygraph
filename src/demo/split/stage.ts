// The stage: a flow's panes side by side in one window (and one video). Each pane is a page in a browser of its own,
// out of sight; the stage shows each one live from its screencast (Chrome DevTools Protocol), labelled with the pane's
// name, who is signed in there and its device, and marks the pane acting. Only the open panes show: one fills the
// stage, a second opening splits it, one closing (`.close(pane)`) gives the room back. Playwright drives the panes' real pages; the
// stage is only what's seen.
import type { Browser, CDPSession, Page } from "@playwright/test";
import type { PaneHost } from "../../engine/run/pane-page.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import type { WgPage } from "../types.js";

/** Space around and between the panes, and each pane's label row, in CSS pixels. */
const PAD = 12;
const GAP = 12;
const LABEL = 30;
/** Each pane's frames: JPEG, every frame the page paints. */
const SCREENCAST = { format: "jpeg", quality: 80, everyNthFrame: 1 } as const;

export interface Stage {
  host: PaneHost;
  close(): Promise<void>;
}

/** Turns `stage` into the panes' stage, for the panes named (in order), with their pages made in `browser`. */
export async function openStage(stage: Page, panes: readonly string[], browser: Browser): Promise<Stage> {
  await stage.goto("about:blank").catch(ignorePageGone);
  const size = stage.viewportSize() ?? (await stage.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  /** Each pane's room when `count` share the stage. */
  const roomFor = (count: number) => ({
    width: Math.floor((size.width - PAD * 2 - GAP * (Math.max(1, count) - 1)) / Math.max(1, count)),
    height: Math.floor(size.height - PAD * 2 - LABEL),
  });
  await stage.evaluate(
    ({ pad, gap }) => {
      document.title = "waygraph · split view";
      const body = document.body;
      body.replaceChildren();
      Object.assign(body.style, { margin: "0", height: "100vh", display: "flex", gap: `${gap}px`, padding: `${pad}px`, boxSizing: "border-box", background: "#16161a", fontFamily: "system-ui, sans-serif" });
    },
    { pad: PAD, gap: GAP },
  );

  // The panes on the stage now, with whether each is sized by the stage (a pane with a device keeps its own size).
  const shown = new Map<string, { page: Page; fitted: boolean; cdp: CDPSession }>();
  const show = (pane: string, data: string) =>
    stage
      .evaluate(([pane, data]) => {
        const img = document.querySelector(`section[data-pane="${CSS.escape(pane)}"] img`);
        if (img instanceof HTMLImageElement) img.src = `data:image/jpeg;base64,${data}`;
      }, [pane, data] as const)
      .catch(ignorePageGone);
  /** The panes the stage sizes take an equal share of it. */
  const relayout = async () => {
    const room = roomFor(shown.size);
    for (const { page, fitted } of shown.values()) {
      if (!fitted) continue;
      // The demo's UI on the pane holds the page at its stage size: the pane's room is its stage now.
      const shown = page as WgPage;
      shown.__wgHeadedStage = room;
      // The demo turns a page's own setViewportSize off (a Block's mustn't resize the window); this is the stage's.
      await (shown.__wgRealSetViewportSize ?? page.setViewportSize.bind(page))(room).catch(ignorePageGone);
    }
  };

  const host: PaneHost = {
    browser,
    // The pane opening joins the ones there.
    viewport: () => roomFor(shown.size + 1),
    async opened(pane, page, label) {
      const room = roomFor(shown.size + 1);
      const at = page.viewportSize();
      await stage
        .evaluate(
          ({ pane, label, order, labelHeight }) => {
            const box = document.createElement("section");
            box.dataset["pane"] = pane;
            box.style.order = String(order);
            Object.assign(box.style, { flex: "1", display: "flex", flexDirection: "column", minWidth: "0", borderRadius: "10px", overflow: "hidden", outline: "2px solid transparent", transition: "outline-color 200ms", background: "#000" });
            const head = document.createElement("header");
            Object.assign(head.style, { height: `${labelHeight}px`, display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", color: "#e8e8ee", background: "#26262c", fontSize: "13px" });
            const title = document.createElement("strong");
            title.textContent = pane;
            const who = document.createElement("span");
            who.style.color = "#a0a0ab";
            who.textContent = label;
            head.append(title, who);
            const img = document.createElement("img");
            img.alt = pane;
            Object.assign(img.style, { flex: "1", minHeight: "0", width: "100%", objectFit: "contain", background: "#000" });
            box.append(head, img);
            document.body.append(box);
          },
          { pane, label, order: Math.max(0, panes.indexOf(pane)), labelHeight: LABEL },
        )
        .catch(ignorePageGone);
      const cdp = await page.context().newCDPSession(page);
      cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
        void show(pane, data);
        cdp.send("Page.screencastFrameAck", { sessionId }).catch(ignorePageGone);
      });
      await cdp.send("Page.startScreencast", SCREENCAST);
      shown.set(pane, { page, cdp, fitted: at?.width === room.width && at.height === room.height });
      await relayout();
    },
    closed(pane) {
      const was = shown.get(pane);
      shown.delete(pane);
      void was?.cdp.detach().catch(ignorePageGone);
      void stage
        .evaluate((pane) => document.querySelector(`section[data-pane="${CSS.escape(pane)}"]`)?.remove(), pane)
        .catch(ignorePageGone);
      void relayout();
    },
    acting(pane) {
      void stage
        .evaluate((pane) => {
          for (const box of document.querySelectorAll<HTMLElement>("section[data-pane]")) {
            box.style.outlineColor = box.dataset["pane"] === pane ? "#7c6cf0" : "transparent";
          }
        }, pane)
        .catch(ignorePageGone);
    },
  };
  return {
    host,
    async close() {
      for (const { cdp } of shown.values()) await cdp.detach().catch(ignorePageGone);
    },
  };
}
