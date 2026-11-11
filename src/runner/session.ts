// The browser a run plays in: launched with the project's extensions, sized for the mode and an optional video.
import { closePanes } from "../engine/run/pane-page.js";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { envString } from "../engine/env.js";
import type { ResolvedDevice } from "../engine/flow/device.js";
import { configuredDevice } from "../demo/overlay/device-config.js";
import { messageOf } from "../engine/errors.js";
import { loadWaygraphConfig } from "../runtime/waygraph-config.js";
import { addVoiceOver, hasFfmpeg, subtitlesOf } from "../runtime/voice.js";
import { VoiceOver } from "../demo/voice-over.js";
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
 * 1280x720 for a run) with the device scale locked, so the recording keeps that size on HiDPI hosts. The config's
 * device (a phone, a tablet, turned) is the browser's size, layout and touch; a recorded demo keeps its 16:9 stage and
 * shows the device in it (the stepper's device shell); a watched demo does too, in its window.
 */
function viewportFor(options: PlayOptions, videoSize: Size | null, device: ResolvedDevice | undefined): Record<string, unknown> {
  const kind = device ? { isMobile: device.isMobile, hasTouch: device.hasTouch } : {};
  if (videoSize) return { viewport: videoSize, deviceScaleFactor: 1, ...(options.mode === "demo" ? {} : kind) };
  // A watched demo keeps its window and shows the device in it (the stepper's device shell), as a recording does.
  if (options.mode === "demo") return { viewport: null };
  if (device) return { viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor, ...kind };
  return { viewport: { width: 1280, height: 720 } };
}


export async function openSession(projectDir: string, options: PlayOptions, mem: MemPage, launchSlowMo: number | undefined): Promise<{ session: PlaySession; close: () => Promise<void> }> {
  const videoDir = options.video ? (options.video === "1" ? await resolveVideoDir(projectDir) : options.video) : null;
  if (videoDir) mkdirSync(videoDir, { recursive: true });
  const device = configuredDevice();
  // A run records the device's own screen; a demo records its 16:9 stage with the device shown in it.
  const videoSize = videoDir
    ? (parseViewport(options.videoViewport) ??
      (options.mode === "demo" ? { width: 1920, height: 1080 } : (device?.viewport ?? { width: 1280, height: 720 })))
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
      ...viewportFor(options, videoSize, device),
      ...(videoDir ? { recordVideo: videoSize ? { dir: videoDir, size: videoSize } : { dir: videoDir } } : {}),
    },
    extensions: extensionPathsFromEnv(),
  });
  const page = (await context.newPage()) as WgPage;
  // The recording starts with the page: a voice-over line's place on it counts from here.
  const recordingStartedAt = Date.now();
  if (videoSize) page.__wgVideoViewport = videoSize;
  if (videoDir && options.mode === "demo") page.__wgVoice = await voiceOverFor(projectDir, recordingStartedAt);
  // The first step's panel shows over the real app, not a blank page.
  if (options.baseURL) await page.goto(options.baseURL).catch(ignorePageGone);

  const close = async (): Promise<void> => {
    const voice = page.__wgVoice;
    // The last line is heard to its end; a recording's last moment (a ring, the network panel) would be cut off
    // mid-fade without a little room.
    await voice?.settle();
    await voice?.close();
    if (videoDir && !page.isClosed()) await sleep(1800);
    await context.close();
    const video = await page.video()?.path().catch(() => null);
    if (video) {
      if (voice?.lines.length) await voiceOverOnto(video, voice);
      console.log("waygraph: video saved to " + video);
      recordArtifact("video", video);
    }
    await closeBrowser();
  };
  return { session: { context, page, mem, baseURL: options.baseURL }, close };
}

/**
 * The voice-over for a recorded demo, when the config gives the demo a voice (`demo.voice`) and `--no-voice` doesn't
 * turn it off. Needs ffmpeg: without it the demo is recorded silent, saying so.
 */
async function voiceOverFor(projectDir: string, startedAt: number): Promise<VoiceOver | undefined> {
  if (envString("WAYGRAPH_VOICE") === "0") return undefined;
  const voice = (await loadWaygraphConfig(projectDir))?.demo?.voice;
  if (!voice) return undefined;
  const missing = voice.speaker.missing?.();
  if (missing) {
    console.error(`waygraph voice: recording without the voice-over: ${missing}`);
    return undefined;
  }
  if (!(await hasFfmpeg())) {
    console.error("waygraph voice: ffmpeg and ffprobe aren't on the PATH; recording without the voice-over (install ffmpeg to add it)");
    return undefined;
  }
  return new VoiceOver(voice.speaker, join(projectDir, ".waygraph", "voice"), startedAt, voice.steps === true);
}

/** Puts the voice-over's lines on the saved video, and writes them beside it as subtitles (`<video>.vtt`). */
async function voiceOverOnto(video: string, voice: VoiceOver): Promise<void> {
  const subtitles = video.replace(/\.\w+$/, ".vtt");
  writeFileSync(subtitles, subtitlesOf(voice.lines));
  try {
    await addVoiceOver(video, voice.lines);
    console.log(`waygraph: voice-over: ${voice.lines.length} lines, subtitles ${subtitles}`);
  } catch (err) {
    console.error(`waygraph voice: the video stays silent (ffmpeg failed: ${messageOf(err)}); subtitles ${subtitles}`);
  }
}

/** A fresh session between episodes: no cookies, no storage, back on the base URL (so the page itself looks fresh too). */
export async function resetPage(session: PlaySession): Promise<void> {
  // A flow's panes go with its session: the next episode opens its own.
  await closePanes(session.page);
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
