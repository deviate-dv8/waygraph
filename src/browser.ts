import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, BrowserContextOptions, BrowserType, LaunchOptions } from "@playwright/test";

let warned = false;

/**
 * CHROME_PATH / CHROMIUM_PATH, if set and the file exists. A stale path (browser uninstalled)
 * falls back to Playwright's bundled Chromium with a one-time warning instead of failing the run.
 */
export function chromiumExecutablePath(): string | undefined {
  const path = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  if (!path) return undefined;
  if (existsSync(path)) return path;
  if (!warned) {
    warned = true;
    console.error(`waygraph: CHROME_PATH/CHROMIUM_PATH "${path}" does not exist - using Playwright's bundled Chromium`);
  }
  return undefined;
}

/** Unpacked extension directories, as resolved by `resolveExtensions` - also what `WAYGRAPH_EXTENSIONS` carries to child processes. */
export function extensionPathsFromEnv(): string[] {
  return (process.env.WAYGRAPH_EXTENSIONS ?? "").split(",").filter(Boolean);
}

export interface LaunchedContext {
  /** Null for a persistent (extension) context. */
  browser: Browser | null;
  context: BrowserContext;
  /** Closes the context and the browser (and the throwaway profile when extensions are loaded). */
  close(): Promise<void>;
}

/**
 * Launches a browser and its first context. With `extensions` it uses a persistent context, the only
 * way Chromium loads extensions: new headless (`channel: "chromium"`; the default headless shell
 * ignores them) and Playwright's own Chromium (branded Chrome 137+ ignores `--load-extension`).
 * Extensions are not active in extra contexts made with `browser.newContext()`.
 */
export async function launchContext(opts: {
  launcher: BrowserType;
  launch: LaunchOptions;
  context?: BrowserContextOptions;
  extensions?: readonly string[];
}): Promise<LaunchedContext> {
  const extensions = opts.extensions ?? [];
  if (extensions.length === 0) {
    const browser = await opts.launcher.launch(opts.launch);
    const context = await browser.newContext(opts.context);
    return { browser, context, close: () => browser.close() };
  }
  if (opts.launcher.name() !== "chromium") throw new Error("waygraph: extensions only work in Chromium");
  const list = extensions.join(",");
  const { executablePath: _ignored, ...launch } = opts.launch;
  const profile = mkdtempSync(join(tmpdir(), "waygraph-profile-"));
  const context = await opts.launcher.launchPersistentContext(profile, {
    ...launch,
    ...opts.context,
    ...(launch.headless === false ? {} : { channel: "chromium" }),
    args: [...(launch.args ?? []), `--disable-extensions-except=${list}`, `--load-extension=${list}`],
  });
  // An extension's background worker registers its page hooks, so wait for it before the first navigation.
  const hasWorker = extensions.some(
    (dir) => JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")).background?.service_worker !== undefined,
  );
  if (hasWorker && context.serviceWorkers().length === 0) {
    await context.waitForEvent("serviceworker", { timeout: 10_000 }).catch(() => undefined);
  }
  return {
    browser: context.browser(),
    context,
    close: async () => {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
