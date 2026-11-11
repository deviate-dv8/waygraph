// The stage: a flow's panes side by side in one window (and one video). Each pane is a page in a browser of its own,
// out of sight; the stage shows each one live from its screencast (Chrome DevTools Protocol), labelled with the pane's
// name, who is signed in there and its device, and marks the pane acting. Only the open panes show: one fills the
// stage, a second opening splits it (more share it as a grid), one closing (`.close(pane)`) gives the room back.
// Playwright drives the panes' real pages. The stage passes what's done on it to the pane under the pointer (a click, a
// scroll, a key), as Playwright's own UI does with its screencast: a demo's Next, Retry and Stop work there as anywhere.
import type { Browser, CDPSession, Page } from "@playwright/test";
import type { PaneHost } from "../../engine/run/pane-page.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import type { WgPage } from "../types.js";

/** Space around and between the panes, and each pane's label row, in CSS pixels. */
const PAD = 0;
const GAP = 2;
const LABEL = 20;
/** Each pane's frames: JPEG, every frame the page paints. */
const SCREENCAST = { format: "jpeg", quality: 80, everyNthFrame: 1 } as const;

/** Something done on the stage, for the pane under the pointer (or the one last pointed at, for a key). */
interface StageInput {
  kind: "move" | "down" | "up" | "wheel" | "keydown" | "keyup";
  pane?: string;
  /** How far across and down the pane's picture, 0 to 1. */
  x?: number;
  y?: number;
  button?: "left" | "middle" | "right";
  dx?: number;
  dy?: number;
  key?: string;
}

export interface Stage {
  host: PaneHost;
  close(): Promise<void>;
}

/** Turns `stage` into the panes' stage, for the panes named (in order), with their pages made in `browser`. */
export async function openStage(stage: Page, panes: readonly string[], browser: Browser): Promise<Stage> {
  await stage.goto("about:blank").catch(ignorePageGone);
  const size = stage.viewportSize() ?? (await stage.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  /** How `count` panes share the stage: side by side up to two, then a grid. */
  const gridFor = (count: number) => {
    const columns = count <= 2 ? Math.max(1, count) : Math.ceil(Math.sqrt(count));
    return { columns, rows: Math.max(1, Math.ceil(count / columns)) };
  };
  /** Each pane's room when `count` share the stage. */
  const roomFor = (count: number) => {
    const { columns, rows } = gridFor(count);
    return {
      width: Math.floor((size.width - PAD * 2 - GAP * (columns - 1)) / columns),
      height: Math.floor((size.height - PAD * 2 - GAP * (rows - 1)) / rows - LABEL),
    };
  };
  await stage.evaluate(
    ({ pad, gap }) => {
      document.title = "waygraph · split view";
      const body = document.body;
      body.replaceChildren();
      Object.assign(body.style, { margin: "0", height: "100vh", display: "grid", gap: `${gap}px`, padding: `${pad}px`, boxSizing: "border-box", background: "#16161a", fontFamily: "system-ui, sans-serif" });
      // A small mark that this is the split view, always there (a stage looks like the page it shows).
      const mark = document.createElement("div");
      mark.id = "wg-split-mark";
      mark.textContent = "split view";
      Object.assign(mark.style, { position: "fixed", right: "6px", bottom: "6px", zIndex: "9", padding: "1px 8px", borderRadius: "999px", fontSize: "10px", color: "#e8e8ee", background: "rgba(38,38,44,.85)", pointerEvents: "none" });
      body.append(mark);
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
    const { columns } = gridFor(shown.size);
    await stage
      .evaluate((columns) => (document.body.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`), columns)
      .catch(ignorePageGone);
    for (const { page, fitted } of shown.values()) {
      if (!fitted) continue;
      // The demo's UI on the pane holds the page at its stage size: the pane's room is its stage now.
      const shown = page as WgPage;
      shown.__wgHeadedStage = room;
      // The demo turns a page's own setViewportSize off (a Block's mustn't resize the window); this is the stage's.
      await (shown.__wgRealSetViewportSize ?? page.setViewportSize.bind(page))(room).catch(ignorePageGone);
    }
  };

  // What's done on the stage goes to the pane under the pointer, at the same place on its page; keys to the pane last
  // pointed at.
  let keysTo: string | undefined;
  await stage.exposeFunction("__wgStageInput", async (input: StageInput) => {
    const pane = input.pane ?? keysTo;
    const page = pane ? shown.get(pane)?.page : undefined;
    if (!page) return;
    if (input.pane) keysTo = input.pane;
    const box = page.viewportSize();
    const x = (input.x ?? 0) * (box?.width ?? 0);
    const y = (input.y ?? 0) * (box?.height ?? 0);
    const button = input.button ?? "left";
    try {
      if (input.kind === "move") {
        await page.mouse.move(x, y);
        // The screencast has no pointer: the stage shows the one the page would (a hand over a link, a text bar over a field).
        const cursor = await page.evaluate(([x, y]) => (document.elementFromPoint(x as number, y as number) ? getComputedStyle(document.elementFromPoint(x as number, y as number)!).cursor : "default"), [x, y]).catch(() => "default");
        await stage.evaluate((cursor) => (document.body.style.cursor = cursor === "auto" ? "default" : cursor), cursor).catch(ignorePageGone);
      }
      else if (input.kind === "down") {
        await page.mouse.move(x, y);
        await page.mouse.down({ button });
      } else if (input.kind === "up") {
        await page.mouse.move(x, y);
        await page.mouse.up({ button });
      } else if (input.kind === "wheel") {
        await page.mouse.move(x, y);
        await page.mouse.wheel(input.dx ?? 0, input.dy ?? 0);
      } else if (input.key) {
        await (input.kind === "keydown" ? page.keyboard.down(input.key) : page.keyboard.up(input.key));
      }
    } catch (err) {
      ignorePageGone(err);
    }
  });
  await stage.evaluate(() => {
    const send = (window as unknown as { __wgStageInput: (input: unknown) => Promise<void> }).__wgStageInput;
    /** Where on its pane's page the pointer is: the pane, and how far across and down its picture (0 to 1). */
    const at = (event: MouseEvent) => {
      const img = (event.target as Element | null)?.closest?.("section[data-pane]")?.querySelector("img");
      const pane = img?.closest("section")?.dataset["pane"];
      if (!img || !pane || !img.naturalWidth) return undefined;
      const rect = img.getBoundingClientRect();
      const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      const drawn = { width: img.naturalWidth * scale, height: img.naturalHeight * scale };
      const x = (event.clientX - rect.left - (rect.width - drawn.width) / 2) / drawn.width;
      const y = (event.clientY - rect.top - (rect.height - drawn.height) / 2) / drawn.height;
      return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { pane, x, y } : undefined;
    };
    const buttons = ["left", "middle", "right"] as const;
    let moving = false;
    document.addEventListener("mousemove", (event) => {
      if (moving) return;
      moving = true;
      requestAnimationFrame(() => {
        moving = false;
        const where = at(event);
        if (where) void send({ kind: "move", ...where });
      });
    });
    for (const kind of ["down", "up"] as const) {
      document.addEventListener(`mouse${kind}`, (event) => {
        const where = at(event);
        if (where) void send({ kind, ...where, button: buttons[event.button] ?? "left" });
      });
    }
    document.addEventListener("wheel", (event) => {
      const where = at(event);
      if (where) void send({ kind: "wheel", ...where, dx: event.deltaX, dy: event.deltaY });
    });
    document.addEventListener("contextmenu", (event) => event.preventDefault());
    for (const kind of ["keydown", "keyup"] as const) {
      document.addEventListener(kind, (event) => {
        event.preventDefault();
        void send({ kind, key: event.key });
      });
    }
  });

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
            Object.assign(box.style, { minHeight: "0", display: "flex", flexDirection: "column", minWidth: "0", overflow: "hidden", outline: "2px solid transparent", outlineOffset: "-2px", transition: "outline-color 200ms", background: "#000" });
            const head = document.createElement("header");
            Object.assign(head.style, { height: `${labelHeight}px`, display: "flex", alignItems: "center", gap: "8px", padding: "0 8px", color: "#e8e8ee", background: "#26262c", fontSize: "11px" });
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
