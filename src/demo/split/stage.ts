// The stage: a flow's panes side by side in one window (and one video). Each pane is a page in a browser of its own,
// out of sight; the stage shows each one live from its screencast (Chrome DevTools Protocol), labelled with the pane's
// name, who is signed in there and its device, and marks the pane acting. Playwright drives the panes' real pages; the
// stage is only what's seen.
import type { Browser, CDPSession, Page } from "@playwright/test";
import type { PaneHost } from "../../engine/run/pane-page.js";
import { ignorePageGone } from "../../engine/page-gone.js";

/** Space around and between the panes, and each pane's label row, in CSS pixels. */
const PAD = 12;
const GAP = 12;
const LABEL = 30;

export interface Stage {
  host: PaneHost;
  close(): Promise<void>;
}

/** Turns `stage` into the panes' stage, for the panes named (in order), with their pages made in `browser`. */
export async function openStage(stage: Page, panes: readonly string[], browser: Browser): Promise<Stage> {
  await stage.goto("about:blank").catch(ignorePageGone);
  const size = stage.viewportSize() ?? (await stage.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const across = Math.max(1, panes.length);
  const screen = {
    width: Math.floor((size.width - PAD * 2 - GAP * (across - 1)) / across),
    height: Math.floor(size.height - PAD * 2 - LABEL),
  };
  await stage.evaluate(
    ({ panes, pad, gap, label }) => {
      document.title = "waygraph · split view";
      const body = document.body;
      body.replaceChildren();
      Object.assign(body.style, { margin: "0", height: "100vh", display: "flex", gap: `${gap}px`, padding: `${pad}px`, boxSizing: "border-box", background: "#16161a", fontFamily: "system-ui, sans-serif" });
      for (const name of panes) {
        const box = document.createElement("section");
        box.dataset["pane"] = name;
        Object.assign(box.style, { flex: "1", display: "flex", flexDirection: "column", minWidth: "0", borderRadius: "10px", overflow: "hidden", outline: "2px solid transparent", transition: "outline-color 200ms", background: "#000" });
        const head = document.createElement("header");
        Object.assign(head.style, { height: `${label}px`, display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", color: "#e8e8ee", background: "#26262c", fontSize: "13px" });
        const title = document.createElement("strong");
        title.textContent = name;
        const who = document.createElement("span");
        who.dataset["role"] = "who";
        who.style.color = "#a0a0ab";
        head.append(title, who);
        const img = document.createElement("img");
        img.alt = name;
        Object.assign(img.style, { flex: "1", minHeight: "0", width: "100%", objectFit: "contain", background: "#000" });
        box.append(head, img);
        body.append(box);
      }
    },
    { panes: [...panes], pad: PAD, gap: GAP, label: LABEL },
  );

  const casts: CDPSession[] = [];
  const show = (pane: string, data: string) =>
    stage
      .evaluate(([pane, data]) => {
        const img = document.querySelector(`section[data-pane="${CSS.escape(pane)}"] img`);
        if (img instanceof HTMLImageElement) img.src = `data:image/jpeg;base64,${data}`;
      }, [pane, data] as const)
      .catch(ignorePageGone);

  const host: PaneHost = {
    browser,
    viewport: () => screen,
    async opened(pane, page, label) {
      await stage
        .evaluate(([pane, label]) => {
          const who = document.querySelector(`section[data-pane="${CSS.escape(pane)}"] [data-role="who"]`);
          if (who) who.textContent = label;
        }, [pane, label] as const)
        .catch(ignorePageGone);
      const cdp = await page.context().newCDPSession(page);
      casts.push(cdp);
      cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
        void show(pane, data);
        cdp.send("Page.screencastFrameAck", { sessionId }).catch(ignorePageGone);
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
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
      for (const cdp of casts) await cdp.detach().catch(ignorePageGone);
    },
  };
}
