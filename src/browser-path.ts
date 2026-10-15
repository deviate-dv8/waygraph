import { existsSync } from "node:fs";

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
