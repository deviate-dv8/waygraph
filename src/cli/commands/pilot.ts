// `waygraph pilot start | sessions | attach`: a session plus the whole graph and a starting snapshot in one call.
import { resolve } from "node:path";
import { envString } from "../../engine/env.js";
import { listBrowserSessions } from "../../live/auto-session/files.js";
import { runAttachLoop } from "../../live/auto-session/ipc.js";
import { pilotAttach, pilotStart } from "../../live/pilot/pilot.js";
import { resolveInjectRoots } from "../../manifest/roots.js";
import { resolveBaseUrl } from "../../runtime/waygraph-config.js";
import { parseCommand } from "../args.js";
import { applyRunFlags, parseRunFlags } from "../flags.js";
import { printBrowserSessionsList } from "../usage.js";

/** Runs a `pilot` subcommand; false when it is a session op for session-ops.ts. */
export async function pilotCase(args: string[]): Promise<boolean> {
    if (args[1] === "sessions") {
      const { values, positionals: positional } = parseCommand("sessions", { json: { type: "boolean", help: "Machine-readable JSON" } }, args.slice(2));
      const json = values.json === true;
      const proj = resolve(positional[0] ?? process.cwd());
      const sessions = listBrowserSessions(proj);
      if (json) {
        console.log(JSON.stringify(sessions, null, 2));
      } else {
        printBrowserSessionsList(sessions, proj);
      }
      return true;
    }
    if (args[1] === "attach") {
      const sessionId = args[2];
      if (!sessionId) {
        console.error("waygraph pilot attach: usage: waygraph pilot attach <sessionId> [--inject …] [project]");
        process.exit(1);
      }
      const flags = parseRunFlags(args.slice(3), "pilot");
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      try {
        const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
        const result = await pilotAttach(proj, sessionId, inject);
        console.log(JSON.stringify(result));
      } catch (err) {
        console.error(`waygraph pilot attach: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      return true;
    }
    if (args[1] === "start" || !args[1] || args[1].startsWith("-")) {
      const flagArgs = args[1] === "start" ? args.slice(2) : args.slice(1);
      const flags = parseRunFlags(flagArgs, "pilot");
      applyRunFlags(flags);
      const proj = resolve(flags.positionals[0] ?? process.cwd());
      const baseURL = flags.baseUrl ?? envString("WAYGRAPH_BASE_URL") ?? (await resolveBaseUrl(proj));
      try {
        const result = await pilotStart({
          projectDir: proj,
          ...(flags.inject?.length ? { injectTokens: flags.inject } : {}),
          ...(baseURL ? { baseURL } : {}),
          ...(flags.goto
            ? { startUrl: flags.goto, skipInitialNavigation: false }
            : flags.blank === true
              ? { skipInitialNavigation: true }
              : {}),
          headless: flags.headlessBrowser === true,
        });
        console.log(JSON.stringify(result));
        if (!result.headless) {
          console.error(
            `Chromium window opened (session ${result.sessionId}). ` +
              `Terminal menu: waygraph pilot attach ${result.sessionId}`,
          );
        }
        if (flags.cli) {
          await runAttachLoop(proj, result.sessionId);
        }
      } catch (err) {
        console.error(`waygraph pilot start: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      return true;
    }
    if (
      args[1] !== "send" &&
      args[1] !== "status" &&
      args[1] !== "dom" &&
      args[1] !== "trace" &&
      args[1] !== "console" &&
      args[1] !== "storage" &&
      args[1] !== "upload" &&
      args[1] !== "click" &&
      args[1] !== "type" &&
      args[1] !== "press" &&
      args[1] !== "goto" &&
      args[1] !== "reload" &&
      args[1] !== "reach" &&
      args[1] !== "resync" &&
      args[1] !== "highlight"
    ) {
      console.error(
        "waygraph pilot: usage:\n" +
          "  waygraph pilot start [--inject …] [--goto <url>] [--headless] [--cli] [--base-url <url>] [project]\n" +
          "  waygraph pilot sessions [project]   # list live browser sessions\n" +
          "  waygraph pilot attach <sessionId>   # graph + snapshot for an existing session\n" +
          "  waygraph pilot send|status|attach|highlight|… <sessionId> …  (controls browser — same as browser/auto)",
      );
      process.exit(1);
    }
  return false;
}
