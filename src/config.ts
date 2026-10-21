// waygraph.config.* - new, additive, optional. package.json's own "waygraph" field (baseUrl)
// keeps working untouched; this is a second, richer place to put the same kind of project-level
// setting, for consumers who'd rather have a real typed file than a JSON field. Real ask: "I
// think its time to add waygraph config now."
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { extensionPathsFromEnv } from "./browser.js";
import type { PlaywrightTestConfig } from "@playwright/test";
import { loadEnvFiles } from "./env-file.js";
import { resolveExtensions } from "./extensions.js";
import type { ExtensionSpec } from "./extensions.js";
import type { WebServerConfig } from "./webserver.js";

export interface WaygraphConfig {
  /** Same value `resolveBaseUrl` would otherwise read from package.json's `waygraph.baseUrl`. */
  baseUrl?: string;
  /** Chromium extensions to load in every run: `"hoppscotch"`, a Chrome Web Store id, or `{ path }` to an unpacked one. */
  extensions?: ExtensionSpec[];
  /** Folder of test files, relative to the project. Default `"tests"`. */
  testDir?: string;
  /** App to start around `waygraph test`, `run`, `demo` and `auto` (same fields as Playwright's `webServer`). */
  webServer?: WebServerConfig | WebServerConfig[];
  /** Anything else for the test runner, e.g. `workers`, `timeout`, `reporter`, `use: { video: "on" }`. Merged over waygraph's defaults. */
  playwright?: PlaywrightTestConfig;
}

/** Identity helper, purely for editor type-checking/autocomplete - same role `defineConfig` plays
 * in a `playwright.config.ts` or `vite.config.ts`. `export default defineConfig({ ... })`. */
export function defineConfig(config: WaygraphConfig): WaygraphConfig {
  return config;
}

const CONFIG_NAMES = ["waygraph.config.ts", "waygraph.config.mts", "waygraph.config.mjs", "waygraph.config.js", "waygraph.config.cjs"];
/** `config/` first, then the project root. */
const CONFIG_FILENAMES = [...CONFIG_NAMES.map((n) => join("config", n)), ...CONFIG_NAMES];

/**
 * Looks for the first `waygraph.config.*` in `projectDir` and imports it - `.ts` works
 * unmodified because `bin/waygraph` already registers `tsx/esm` before `dist/cli.js` ever runs
 * (the same mechanism that already lets a consumer's `.block.ts`/`.flow.ts` import directly), so
 * no separate loader/transpile step is needed here. A broken config file throws loud, naming the
 * file - silently swallowing it would make a missing `baseUrl` look like "nobody configured
 * anything" instead of "your config file has a bug."
 */
export async function loadWaygraphConfig(projectDir: string): Promise<WaygraphConfig | undefined> {
  for (const name of CONFIG_FILENAMES) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    let mod: { default?: WaygraphConfig } & WaygraphConfig;
    try {
      mod = (await import(pathToFileURL(p).href)) as { default?: WaygraphConfig } & WaygraphConfig;
    } catch (err) {
      throw new Error(
        `waygraph: failed to load ${name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return mod.default ?? mod;
  }
  return undefined;
}

/**
 * Single source of truth for a project's base URL. Was three independently drifted copies
 * (`src/cli/flags.ts`, `src/traverse/run.ts`, `src/session/auto-explore-run.ts`), each checking
 * a slightly different subset of sources in a different order - real duplication, not just
 * stylistic, since one copy skipped `config.waygraph.*` nesting and another checked
 * `WAYGRAPH_BASE_URL` first instead of last. Checked in this order:
 *
 * 1. `WAYGRAPH_BASE_URL` - a real shell export, or one loaded from a `.env` file (see
 *    `loadEnvFiles`, called here so every caller gets native `.env` support for free, not just
 *    whichever command remembered to call it).
 * 2. A `waygraph.config.*` file's `baseUrl`.
 * 3. `package.json`'s `waygraph.baseUrl`/`baseURL` (`config.waygraph.*` also checked - a common
 *    nested-config convention some tooling uses).
 * 4. `playwright.config.*`'s own `baseURL` (regex-read as text, never imported - importing a
 *    consumer's real playwright.config risks pulling in `@playwright/test`'s own global setup
 *    as a side effect, which resolving a URL string has no business doing).
 */
export async function resolveBaseUrl(projectDir: string): Promise<string | undefined> {
  loadEnvFiles(projectDir);
  if (process.env.WAYGRAPH_BASE_URL) return process.env.WAYGRAPH_BASE_URL;

  const config = await loadWaygraphConfig(projectDir);
  if (config?.baseUrl && config.baseUrl.trim()) return config.baseUrl.trim();

  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        waygraph?: { baseUrl?: string; baseURL?: string };
        config?: { waygraph?: { baseUrl?: string; baseURL?: string } };
      };
      const fromPkg =
        pkg.waygraph?.baseUrl ??
        pkg.waygraph?.baseURL ??
        pkg.config?.waygraph?.baseUrl ??
        pkg.config?.waygraph?.baseURL;
      if (typeof fromPkg === "string" && fromPkg.trim()) return fromPkg.trim();
    } catch {
      // ignore malformed package.json - fall through to playwright.config
    }
  }

  for (const name of ["playwright.config.ts", "playwright.config.mts", "playwright.config.js", "playwright.config.mjs"]) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf-8");
    const m = src.match(/baseURL\s*:\s*["']([^"']+)["']/);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Unpacked extension directories for a run: `WAYGRAPH_EXTENSIONS` if set, else the config file's `extensions` (fetched on first use). */
export async function configuredExtensions(projectDir: string): Promise<string[]> {
  const fromEnv = extensionPathsFromEnv();
  if (fromEnv.length > 0) return fromEnv;
  loadEnvFiles(projectDir);
  return resolveExtensions((await loadWaygraphConfig(projectDir))?.extensions, projectDir);
}
