// `waygraph browser start | sessions | stop`: start a detached session, list them, stop them. The session ops
// (send, status, ...) are session-ops.ts.
import { messageOf } from "../../engine/errors.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { envString } from "../../engine/env.js";
import { listBrowserSessions, stopAllBrowserSessions, stopBrowserSession } from "../../live/auto-session/files.js";
import { runAttachLoop } from "../../live/auto-session/ipc.js";
import { browserStart } from "../../live/auto-session/start.js";
import { resolveInjectRoots } from "../../manifest/roots.js";
import { resolveBaseUrl } from "../../runtime/waygraph-config.js";
import { parseCommand } from "../args.js";
import { applyRunFlags, parseRunFlags } from "../flags.js";
import { printBrowserSessionsList, printBrowserUsage } from "../usage.js";

/** `browser sessions [project] [--json]` (and `pilot sessions`): the project's live sessions. */
export function sessionsCommand(rest: string[]): void {
  const { values, positionals } = parseCommand("sessions", { json: { type: "boolean", help: "Machine-readable JSON" } }, rest);
  const proj = resolve(positionals[0] ?? process.cwd());
  const sessions = listBrowserSessions(proj);
  if (values.json === true) console.log(JSON.stringify(sessions, null, 2));
  else printBrowserSessionsList(sessions, proj);
}

/** Runs a `browser` subcommand; false when it is a session op for session-ops.ts. */
export async function browserCase(args: string[]): Promise<boolean> {
    const sub = args[1];
    if (sub === "sessions") {
      sessionsCommand(args.slice(2));
      return true;
    }
    if (sub === "stop") {
      const proj = resolve(args[3] ?? process.cwd());
      const target = args[2];
      if (!target) {
        console.error("waygraph browser stop: usage: waygraph browser stop <sessionId|--all> [project]");
        process.exit(1);
      }
      if (target === "--all") {
        const n = stopAllBrowserSessions(proj);
        console.log(JSON.stringify({ stopped: n, projectDir: proj }));
        return true;
      }
      if (!stopBrowserSession(proj, target)) {
        console.error(`waygraph browser stop: no such session "${target}"`);
        process.exit(1);
      }
      console.log(JSON.stringify({ stopped: target }));
      return true;
    }
    if (!sub) {
      printBrowserUsage();
      return true;
    }
    if (sub === "start" || sub.startsWith("-")) {
      const flagArgs = sub === "start" ? args.slice(2) : args.slice(1);
      const flags = parseRunFlags(flagArgs, "browser");
      applyRunFlags(flags);
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph browser: no such directory: ${proj}`);
        process.exit(1);
      }
      const baseURL = flags.baseUrl ?? envString("WAYGRAPH_BASE_URL") ?? (await resolveBaseUrl(proj));
      try {
        const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
        const result = await browserStart({
          projectDir: proj,
          ...(inject?.length ? { inject } : {}),
          ...(baseURL ? { baseURL } : {}),
          ...(flags.goto
            ? { startUrl: flags.goto, skipInitialNavigation: false }
            : { skipInitialNavigation: flags.blank !== false }),
          headless: flags.headlessBrowser === true,
        });
        console.log(JSON.stringify(result));
        if (!result.headless) {
          console.error(`Session ${result.sessionId} started. List all: waygraph browser sessions`);
        }
        if (flags.cli) {
          await runAttachLoop(proj, result.sessionId);
        }
      } catch (err) {
        console.error(`waygraph browser start: ${messageOf(err)}`);
        process.exit(1);
      }
      return true;
    }
    if (
      sub !== "send" &&
      sub !== "status" &&
      sub !== "attach" &&
      sub !== "dom" &&
      sub !== "trace" &&
      sub !== "console" &&
      sub !== "storage" &&
      sub !== "upload" &&
      sub !== "click" &&
      sub !== "type" &&
      sub !== "press" &&
      sub !== "goto" &&
      sub !== "reload" &&
      sub !== "reach" &&
      sub !== "resync" &&
      sub !== "highlight"
    ) {
      console.error("waygraph browser: unknown subcommand — run `waygraph browser` for usage");
      printBrowserUsage();
      process.exit(1);
    }
  return false;
}
