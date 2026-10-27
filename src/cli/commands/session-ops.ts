// Session ops against a running session by id: `waygraph auto|browser|pilot <op> <sessionId> ...` (send, status,
// attach, dom, trace, console, storage, click, type, press, goto, upload, reload, reach, resync, highlight).
import { resolve } from "node:path";
import { parseHighlightShorthand } from "../../demo/narration/shorthand.js";
import { resolveSessionMeta } from "../../live/auto-session/files.js";
import { requestSession, runAttachLoop } from "../../live/auto-session/ipc.js";
import type { OptionTable } from "../args.js";
import { parseCommand } from "../args.js";
import { subscribeSession } from "../../live/auto-session/feed.js";
import { SESSION_OPS } from "../../live/auto-session/protocol.js";

const SEND_OPTIONS = {
  timeout: { type: "string", value: "<ms>", help: "How long one Block may run (default 15000)" },
} as const satisfies OptionTable;

const DOM_OPTIONS = {
  mode: { type: "string", value: "aria|full", help: "Accessibility tree (default) or the full DOM" },
  selector: { type: "string", value: "<css>", help: "Only this element's subtree" },
  depth: { type: "string", value: "N", help: "Levels to read" },
} as const satisfies OptionTable;

/** The protocol's ops, as CLI subcommands: `subscribe` is `watch`; `attach` is the CLI's own interactive loop. */
const OPS = new Set<string>([...SESSION_OPS.filter((op) => op !== "subscribe"), "watch", "attach"]);

/** Whether `sub` is a session op (`attach` is pilot's own subcommand, not an op, under `pilot`). */
export function isSessionOp(command: string, sub: string | undefined): boolean {
  return sub !== undefined && OPS.has(sub) && !(sub === "attach" && command === "pilot");
}

export async function sessionOpCase(args: string[], command: string): Promise<void> {
    const sub = args[1];
    const sessionId = args[2];
    if (!sessionId) {
      console.error(`waygraph ${command} ${sub}: missing <sessionId>`);
      process.exit(1);
    }
    const projHint = resolve(process.cwd());
    const meta = resolveSessionMeta(sessionId, projHint);
    if (!meta) {
      console.error(
        `waygraph ${command} ${sub}: no such session "${sessionId}" — ` +
          "wrong directory? run `waygraph pilot sessions` from the project that started it",
      );
      process.exit(1);
    }
    const proj = meta.projectDir;
    if (sub === "attach") {
      await runAttachLoop(proj, sessionId);
      return;
    }
    if (sub === "send") {
      const pick = args[3];
      if (pick === undefined) {
        console.error('waygraph auto send: usage: waygraph auto send <sessionId> "<pick>" [--timeout <ms>]');
        process.exit(1);
      }
      // Real, direct need found live: a single Block can legitimately
      // run a genuinely slow real interaction (e.g. a multi-step mouse
      // drag) that exceeds the 15s default - same reasoning `auto
      // reach` already gets a 90s default for (multiple Blocks in one
      // call). Unlike reach, send has no way to know ahead of time
      // whether the ONE Block it's running is fast or slow, so this is
      // opt-in via a flag rather than a raised default.
      let timeoutMs: number | undefined;
      const raw = parseCommand("auto send", SEND_OPTIONS, args.slice(4)).values.timeout;
      if (raw !== undefined) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          console.error(`waygraph auto send: --timeout must be a positive number of ms, got "${raw}"`);
          process.exit(1);
        }
        timeoutMs = n;
      }
      const res = await requestSession(proj, sessionId, { op: "send", pick }, timeoutMs);
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "dom") {
      const domArgs = args.slice(3);
      let mode: "aria" | "full" | undefined;
      let selector: string | undefined;
      let depth: number | undefined;
      const dom = parseCommand("auto dom", DOM_OPTIONS, domArgs).values;
      if (dom.mode !== undefined) {
        if (dom.mode !== "aria" && dom.mode !== "full") {
          console.error(`waygraph auto dom: --mode must be "aria" or "full", got "${dom.mode}"`);
          process.exit(1);
        }
        mode = dom.mode;
      }
      selector = dom.selector;
      if (dom.depth !== undefined) {
        const n = Number(dom.depth);
        if (!Number.isInteger(n) || n < 1) {
          console.error(`waygraph auto dom: --depth must be a positive integer, got "${dom.depth}"`);
          process.exit(1);
        }
        depth = n;
      }
      const res = await requestSession(proj, sessionId, {
        op: "dom",
        ...(mode ? { mode } : {}),
        ...(selector ? { selector } : {}),
        ...(depth !== undefined ? { depth } : {}),
      });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "trace") {
      const res = await requestSession(proj, sessionId, { op: "trace" });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "console") {
      const res = await requestSession(proj, sessionId, { op: "console" });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "hello") {
      const res = await requestSession(proj, sessionId, { op: "hello" });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "watch") {
      // One JSON line per run event (steps, reads) and per new snapshot, until Ctrl-C or the session ends.
      const feed = await subscribeSession(proj, sessionId, (message) => console.log(JSON.stringify(message)));
      process.once("SIGINT", () => feed.close());
      await feed.closed;
      return;
    }
    if (sub === "read") {
      const path = args[3];
      const res = await requestSession(proj, sessionId, path ? { op: "read", path } : { op: "read" });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "storage") {
      const res = await requestSession(proj, sessionId, { op: "storage" });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "click") {
      const selector = args[3];
      if (selector === undefined) {
        console.error('waygraph auto click: usage: waygraph auto click <sessionId> "<selector>"');
        process.exit(1);
      }
      const res = await requestSession(proj, sessionId, { op: "click", selector });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "type") {
      const selector = args[3];
      const text = args[4];
      if (selector === undefined || text === undefined) {
        console.error('waygraph auto type: usage: waygraph auto type <sessionId> "<selector>" "<text>"');
        process.exit(1);
      }
      const res = await requestSession(proj, sessionId, { op: "type", selector, text });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "press") {
      const selector = args[3];
      const key = args[4];
      if (selector === undefined || key === undefined) {
        console.error('waygraph auto press: usage: waygraph auto press <sessionId> "<selector>" <key>');
        process.exit(1);
      }
      const res = await requestSession(proj, sessionId, { op: "press", selector, key });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "goto") {
      const url = args[3];
      if (url === undefined) {
        console.error("waygraph auto goto: usage: waygraph auto goto <sessionId> <url>");
        process.exit(1);
      }
      const res = await requestSession(proj, sessionId, { op: "goto", url });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "upload") {
      const selector = args[3];
      const kindOrPath = args[4];
      if (selector === undefined || kindOrPath === undefined) {
        console.error(
          'waygraph auto upload: usage: waygraph auto upload <sessionId> "<selector>" <image|pdf|video|path-to-file>',
        );
        process.exit(1);
      }
      const stub: { selector: string; stub: "image" | "pdf" | "video" | { filePath: string } } =
        kindOrPath === "image" || kindOrPath === "pdf" || kindOrPath === "video"
          ? { selector, stub: kindOrPath }
          : { selector, stub: { filePath: resolve(process.cwd(), kindOrPath) } };
      const res = await requestSession(proj, sessionId, { op: "upload", ...stub });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "reload") {
      const res = await requestSession(proj, sessionId, { op: "reload" });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "reach") {
      const checkpoint = args[3];
      if (checkpoint === undefined) {
        console.error("waygraph auto reach: usage: waygraph auto reach <sessionId> <Checkpoint>");
        process.exit(1);
      }
      // Longer than every other op's default (15s): a real multi-step
      // route runs several real Blocks in sequence server-side before
      // responding - a legitimately slow single request, not a hang.
      const res = await requestSession(proj, sessionId, { op: "reach", checkpoint }, 90_000);
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "resync") {
      const res = await requestSession(proj, sessionId, { op: "resync" });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (sub === "highlight") {
      const raw = args[3];
      if (raw === undefined) {
        console.error(
          `waygraph ${command} highlight: usage:\n` +
            `  waygraph ${command} highlight <sessionId> '{"rings":[{"selector":"#x","label":"X"}]}'\n` +
            `  waygraph ${command} highlight <sessionId> "#x|X" (shorthand: <selector>|<label>[|<tone>], rings separated by ";")`,
        );
        process.exit(1);
      }
      let fixtures: Record<string, unknown>;
      try {
        fixtures = JSON.parse(raw) as Record<string, unknown>;
      } catch (jsonErr) {
        const shorthand = parseHighlightShorthand(raw);
        if (shorthand.type === "error") {
          console.error(
            `waygraph ${command} highlight: body is neither valid JSON (${
              jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
            }) nor valid shorthand (${shorthand.reason})`,
          );
          process.exit(1);
        }
        fixtures = shorthand.fixtures;
      }
      if (fixtures.op !== undefined && fixtures.op !== "highlight") {
        console.error(`waygraph ${command} highlight: do not set "op" (or set it to "highlight")`);
        process.exit(1);
      }
      const { op: _ignore, ...rest } = fixtures as { op?: string } & Record<string, unknown>;
      const res = await requestSession(proj, sessionId, {
        op: "highlight",
        ...(rest as import("../../demo/overlay/pilot/fixtures.js").PilotHighlightFixtures),
      });
      console.log(JSON.stringify(res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    const res = await requestSession(proj, sessionId, { op: "status" });
    console.log(JSON.stringify(res));
    if (!res.ok) process.exitCode = 1;
    return;
}
