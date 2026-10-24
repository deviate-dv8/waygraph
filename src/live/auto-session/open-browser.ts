// The browser a session drives: Chromium (maximized when visible), the project's extensions, the persistent pilot
// overlay, and the start page.
import type { BrowserContext, BrowserContextOptions, Page } from "@playwright/test";
import { instrumentPilotActions } from "../../demo/overlay/pilot/actions.js";
import { installPersistentPilotOverlay } from "../../demo/overlay/pilot/shell.js";
import { ignorePageGone, ignoreTimeout } from "../../engine/page-gone.js";
import { chromiumExecutablePath, launchContext } from "../../runtime/browser.js";
import { configuredExtensions } from "../../runtime/waygraph-config.js";

export async function openSessionBrowser(
  projectDir: string,
  headless: boolean,
  baseURL: string | undefined,
  startUrl: string | undefined,
): Promise<{ closeBrowser: () => Promise<void>; context: BrowserContext; page: Page }> {
  const { chromium } = await import("@playwright/test");
  const executablePath = chromiumExecutablePath();
  // Real gap found live: a headed (--non-headless) session kept a fixed
  // 1280x720 content area even when the user maximized/fullscreened the
  // actual window - `viewport: null` alone only makes the PAGE track the
  // window; the window itself still launches at Chromium's own small
  // default size unless told to start maximized. Same fix cli.ts's own
  // --step/headed launch already uses (see its own comment there) -
  // headless keeps the fixed viewport since there's no real window to size.
  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless,
    // Keep Playwright's default --no-startup-window for headful: without it
    // Chromium opens its own "New Tab" window AND our context.newPage() opens
    // a second about:blank window. bringToFront() below surfaces the real page.
    args: headless ? [] : ["--start-maximized"],
  };
  if (executablePath) launchOpts.executablePath = executablePath;
  const contextOpts: BrowserContextOptions = {
    viewport: headless ? { width: 1280, height: 720 } : null,
  };
  if (baseURL) contextOpts.baseURL = baseURL;
  const { close: closeBrowser, context } = await launchContext({
    launcher: chromium,
    launch: launchOpts,
    context: contextOpts,
    extensions: await configuredExtensions(projectDir),
  });
  await installPersistentPilotOverlay(context);
  const page = await context.newPage();
  instrumentPilotActions(page, headless ? 0 : 450);
  if (startUrl) {
    await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(ignorePageGone);
    await page.waitForLoadState("load").catch(ignoreTimeout);
  } else {
    await page.goto("about:blank").catch(ignorePageGone);
  }
  return { closeBrowser, context, page };
}
