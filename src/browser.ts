/**
 * `waygraph browser` — persistent Playwright session with the project's Block
 * library loaded (and optional `--inject` roots). Pilot drives these sessions
 * via `browser send|status|highlight|…`; it does not spawn its own browser.
 *
 * Session lifecycle is explicit: `browser sessions` lists what's live;
 * `browser start` always opens another; `browser attach` / `browser stop` pick one up or shut it down.
 */
import { spawnDetachedSession } from "./auto-session-ipc.js";
import type { AutoSessionInit } from "./auto-session.js";
import { resolveInjectRoots } from "./block-inject.js";

export interface BrowserStartInit extends AutoSessionInit {
  /** Preset names or paths; resolved before spawn. */
  injectTokens?: string[];
}

export interface BrowserStartResult {
  sessionId: string;
  socketPath: string;
  headless: boolean;
  /** Resolved inject roots merged into this session (host project excluded). */
  inject: string[];
}

/** Always spawns a new detached session — does not stop or reuse existing ones. */
export async function browserStart(init: BrowserStartInit): Promise<BrowserStartResult> {
  const inject =
    init.inject ??
    (init.injectTokens?.length ? resolveInjectRoots(init.injectTokens, init.projectDir) : []);
  const headless = init.headless ?? false;
  const meta = await spawnDetachedSession({
    ...init,
    inject,
    headless,
    skipInitialNavigation: init.skipInitialNavigation ?? true,
  });
  return {
    sessionId: meta.sessionId,
    socketPath: meta.socketPath,
    headless: meta.headless,
    inject,
  };
}

export {
  listBrowserSessions,
  stopBrowserSession,
  stopAllBrowserSessions,
  type SessionMeta,
} from "./auto-session-ipc.js";
