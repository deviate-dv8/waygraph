// A flow with panes, played to be seen (a demo, a video): its panes side by side, on a stage in the session's own
// window (demo/split/stage.ts) or in windows of their own (`--split windows`). The panes play in a browser of their own;
// `--video-panes` also records each. Played only to pass or fail (`waygraph run`, a test), a flow's panes need neither.
import type { Page } from "@playwright/test";
import { paneOf, setPaneHost, type PaneHost } from "../engine/run/pane-page.js";
import { recordArtifact } from "../engine/run/events.js";
import { openStage } from "../demo/split/stage.js";
import { windowsHost } from "../demo/split/windows.js";
import { chromiumExecutablePath } from "../runtime/browser.js";
import { resolveVideoDir } from "../runtime/video-dir.js";
import type { PlaySession, PlayStep } from "./mode.js";
import type { PlayOptions } from "./options.js";

/** How these steps' panes are shown, when they have panes and are played to be seen; `close` ends it. */
export async function openSplit(projectDir: string, session: PlaySession, steps: readonly PlayStep[], options: PlayOptions): Promise<{ close(): Promise<void> } | undefined> {
  const mark = steps.map((s) => paneOf(s.block)).find((pane) => pane !== undefined);
  if (!mark || (options.mode !== "demo" && !options.video)) return undefined;
  const names = Object.keys(mark.panes);
  const windows = options.split === "windows";
  const { chromium } = await import("@playwright/test");
  const executablePath = chromiumExecutablePath();
  // On the stage, the panes play out of sight; in windows, on screen, each window placed beside the last.
  const browser = await chromium.launch({ headless: windows ? !options.headed : true, ...(executablePath ? { executablePath } : {}) });
  const stage = windows ? undefined : await openStage(session.page, names, browser);
  const shown = stage?.host ?? (await windowsHost(session.page, names, browser));
  // Each pane's own video, beside the stage's: --video-panes.
  const videoDir = options.videoPanes ? (options.video && options.video !== "1" ? options.video : await resolveVideoDir(projectDir)) : undefined;
  const pages: [string, Page][] = [];
  const host: PaneHost = {
    ...shown,
    contextOptions: (pane) => ({ ...shown.contextOptions?.(pane), ...(videoDir ? { recordVideo: { dir: videoDir, size: shown.viewport(pane) } } : {}) }),
    async opened(pane, page, label) {
      pages.push([pane, page]);
      await shown.opened(pane, page, label);
    },
  };
  setPaneHost(session.page, host);
  return {
    async close() {
      await stage?.close();
      await browser.close();
      // A pane's video is written when its context closes, with the flow.
      for (const [pane, page] of pages) {
        const video = await page.video()?.path().catch(() => null);
        if (!video) continue;
        console.log(`waygraph: pane ${pane}'s video saved to ${video}`);
        recordArtifact("video", video);
      }
    },
  };
}
