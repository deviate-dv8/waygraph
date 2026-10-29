// The browser a run plays in: launched with the project's extensions, sized for the mode and an optional video.
import { mkdirSync } from "node:fs";
import { recordArtifact } from "../engine/run/events.js";
import type { MemPage } from "../engine/mem/mem.js";
import { chromiumExecutablePath, extensionPathsFromEnv, launchContext } from "../runtime/browser.js";
import { resolveVideoDir } from "../runtime/video-dir.js";
import type { WgPage } from "../demo/types.js";
import type { PlaySession } from "./mode.js";
import type { PlayOptions } from "./options.js";
import { ignorePageGone } from "../engine/page-gone.js";
import { parseViewport } from "../runtime/viewport.js";

type Size = { width: number; height: number };


/**
 * A demo window fills the screen (viewport null, maximized). A video is a fixed 16:9 capture (1920x1080 for a demo,
 * 1280x720 for a run) with the device scale locked, so the recording keeps that size on HiDPI hosts.
 */
function viewportFor(options: PlayOptions, videoSize: Size | null): Record<string, unknown> {
  if (videoSize) return { viewport: videoSize, deviceScaleFactor: 1 };
  return options.mode === "demo" ? { viewport: null } : { viewport: { width: 1280, height: 720 } };
}

export async function openSession(projectDir: string, options: PlayOptions, mem: MemPage, launchSlowMo: number | undefined): Promise<{ session: PlaySession; close: () => Promise<void> }> {
  const videoDir = options.video ? (options.video === "1" ? await resolveVideoDir(projectDir) : options.video) : null;
  if (videoDir) mkdirSync(videoDir, { recursive: true });
  const videoSize = videoDir
    ? (parseViewport(options.videoViewport) ?? (options.mode === "demo" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 }))
    : null;
  const { chromium } = await import("@playwright/test");
  const executablePath = chromiumExecutablePath();
  const { context, close: closeBrowser } = await launchContext({
    launcher: chromium,
    launch: {
      headless: !options.headed,
      ...(launchSlowMo !== undefined ? { slowMo: launchSlowMo } : {}),
      args: options.mode === "demo" || videoSize ? ["--start-maximized"] : [],
      ...(executablePath ? { executablePath } : {}),
    },
    context: {
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      hasTouch: true,
      ...viewportFor(options, videoSize),
      ...(videoDir ? { recordVideo: videoSize ? { dir: videoDir, size: videoSize } : { dir: videoDir } } : {}),
    },
    extensions: extensionPathsFromEnv(),
  });
  const page = (await context.newPage()) as WgPage;
  if (videoSize) page.__wgVideoViewport = videoSize;
  // The first step's panel shows over the real app, not a blank page.
  if (options.baseURL) await page.goto(options.baseURL).catch(ignorePageGone);

  const close = async (): Promise<void> => {
    // A recording's last moment (a ring, the network panel) would be cut off mid-fade without a little room.
    if (videoDir && !page.isClosed()) await new Promise((r) => setTimeout(r, 1800));
    await context.close();
    const video = await page.video()?.path().catch(() => null);
    if (video) {
      console.log("waygraph: video saved to " + video);
      recordArtifact("video", video);
    }
    await closeBrowser();
  };
  return { session: { context, page, mem, baseURL: options.baseURL }, close };
}

/** A fresh session between episodes: no cookies, no storage, back on the base URL (so the page itself looks fresh too). */
export async function resetPage(session: PlaySession): Promise<void> {
  await session.context.clearCookies().catch(ignorePageGone);
  await session.page
    .evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage blocked (e.g. about:blank) - nothing to clear anyway */
      }
    })
    .catch(ignorePageGone);
  await session.page.goto(session.baseURL || "about:blank").catch(ignorePageGone);
}
