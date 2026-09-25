// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { chromium, firefox, webkit } from "@playwright/test";
import type { BrowserType } from "@playwright/test";
import type { Layout } from "./run-graph.js";

const LAUNCHERS = { chromium, firefox, webkit };


/**
 * Resolves which `BrowserType` actually launches for a `mem`-only run (no
 * caller-supplied context) - `config.browsers[browserName]` if given,
 * otherwise the real `@playwright/test` export. Waygraph is deliberately
 * "just an opinionated Playwright" - it doesn't own browser automation
 * itself, so it shouldn't force every consumer onto the vanilla launcher.
 * A stealth-patched or otherwise customized launcher (e.g. `playwright-extra`
 * plus a stealth plugin) is a drop-in replacement for `chromium`/`firefox`/
 * `webkit` - same `.launch()` shape - so accepting one here costs nothing for
 * a consumer who never sets it.
 */
export function resolveLauncher(
  browserName: "chromium" | "firefox" | "webkit",
  config: EngineConfig | undefined,
): BrowserType {
  return config?.browsers?.[browserName] ?? LAUNCHERS[browserName];
}


/** Configures how an Engine launches its own browser - only used by `Flow.run(mem)` (no context given); ignored by `Flow.run(context, mem)`, since that context is already launched. */
export interface EngineConfig {
  /** Default `true`, matching Playwright's own default. */
  headless?: boolean;
  /** Default `"chromium"`. */
  browserName?: "chromium" | "firefox" | "webkit";
  /** Milliseconds Playwright pauses before each operation - for watching a non-headless run with your own eyes, not for real runs. Default `0`. */
  slowMo?: number;
  /**
   * Overrides which `BrowserType` actually launches, per browser name -
   * default is the real `@playwright/test` export for whichever one
   * `browserName` picks. Accepts anything shaped like Playwright's own
   * `chromium`/`firefox`/`webkit` (same `.launch()` signature) - a
   * stealth-patched or otherwise customized launcher (e.g. `playwright-extra`
   * plus a stealth plugin) drops in here unmodified. Puppeteer is a
   * different `Page`/`BrowserContext` shape entirely and isn't supported by
   * this seam.
   * @example new Engine({ browsers: { chromium: stealthChromium } })
   */
  browsers?: Partial<Record<"chromium" | "firefox" | "webkit", BrowserType>>;
  /**
   * Playwright `recordVideo` - saves a `.webm` when the context closes.
   * Works headless. Lighter than a full clip-engine pipeline (no overlay/ffmpeg).
   * @example new Engine({ recordVideo: { dir: "./videos" } })
   */
  recordVideo?: { dir: string; size?: { width: number; height: number } };
  /**
   * Cross-cutting, automatically-enforced verify (see {@link defineLayout})
   * - applies to every Flow this Engine defines. Works the same regardless
   * of folder convention (Waygraph Map or freeform "manual mode") since
   * matching is by Checkpoint tag, never by file path.
   * @example new Engine({ layouts: [AppShellLayout] })
   */
  layouts?: readonly Layout[];
}
