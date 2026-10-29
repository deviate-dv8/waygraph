// Session ops against a running session by id: `waygraph auto|browser|pilot <op> <sessionId> ...` (send, status,
// attach, dom, trace, console, storage, click, type, press, goto, upload, reload, reach, resync, highlight).
import { messageOf } from "../../engine/errors.js";
import { resolve } from "node:path";
import { parseHighlightShorthand } from "../../demo/narration/shorthand.js";
import { resolveSessionMeta } from "../../live/auto-session/files.js";
import { requestSession, runAttachLoop } from "../../live/auto-session/ipc.js";
import type { SessionRequest, SessionResponse } from "../../live/auto-session/protocol.js";
import type { OptionTable } from "../args.js";
import { parseCommand } from "../args.js";
import { subscribeSession } from "../../live/auto-session/feed.js";
import { SESSION_OPS } from "../../live/auto-session/protocol.js";
import type { PilotHighlightFixtures } from "../../demo/overlay/pilot/fixtures.js";

const SEND_OPTIONS = {
  timeout: { type: "string", value: "<ms>", help: "How long one Block may run (default 15000)" },
} as const satisfies OptionTable;

const READ_OPTIONS = {
  rows: { type: "string", value: "<from>:<to>", help: "Rows of the list at <path>, e.g. 20:40" },
  where: { type: "string", multiple: true, value: "<field>=<value>", help: "Rows of the list at <path> where a field matches" },
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

/** Ops that take only positional arguments, after the session id: `click <id> "<selector>"`. */
const POSITIONAL_OPS = {
  click: { args: ["selector"], usage: '"<selector>"' },
  type: { args: ["selector", "text"], usage: '"<selector>" "<text>"' },
  press: { args: ["selector", "key"], usage: '"<selector>" <key>' },
  goto: { args: ["url"], usage: "<url>" },
  // A route runs several Blocks before it answers: longer than one op's 15 s.
  reach: { args: ["checkpoint"], usage: "<Checkpoint>", timeoutMs: 90_000 },
} as const satisfies Record<string, { args: readonly string[]; usage: string; timeoutMs?: number }>;

/** Ops that take nothing but the session id. */
const BARE_OPS = new Set(["status", "trace", "console", "hello", "storage", "reload", "resync"]);

/** Prints a reply as JSON; a reply that isn't ok fails the command. */
function reply(res: SessionResponse): void {
  console.log(JSON.stringify(res));
  if (!res.ok) process.exitCode = 1;
}

function usage(command: string, sub: string, rest: string): never {
  console.error(`waygraph ${command} ${sub}: usage: waygraph ${command} ${sub} <sessionId> ${rest}`);
  process.exit(1);
}

export async function sessionOpCase(args: string[], command: string): Promise<void> {
  const sub = args[1] ?? "status";
  const sessionId = args[2];
  if (!sessionId) {
    console.error(`waygraph ${command} ${sub}: missing <sessionId>`);
    process.exit(1);
  }
  const meta = resolveSessionMeta(sessionId, resolve(process.cwd()));
  if (!meta) {
    console.error(
      `waygraph ${command} ${sub}: no such session "${sessionId}" — ` +
        "wrong directory? run `waygraph pilot sessions` from the project that started it",
    );
    process.exit(1);
  }
  const proj = meta.projectDir;
  const request = (req: SessionRequest, timeoutMs?: number) => requestSession(proj, sessionId, req, timeoutMs).then(reply);

  if (sub in POSITIONAL_OPS) {
    const spec = POSITIONAL_OPS[sub as keyof typeof POSITIONAL_OPS];
    const values = args.slice(3, 3 + spec.args.length);
    if (values.length < spec.args.length) usage(command, sub, spec.usage);
    const req = { op: sub, ...Object.fromEntries(spec.args.map((name, i) => [name, values[i]])) } as SessionRequest;
    return request(req, "timeoutMs" in spec ? spec.timeoutMs : undefined);
  }
  if (BARE_OPS.has(sub)) return request({ op: sub } as SessionRequest);

  switch (sub) {
    case "attach":
      return runAttachLoop(proj, sessionId);
    case "send": {
      const pick = args[3];
      if (pick === undefined) usage(command, sub, '"<pick>" [--timeout <ms>]');
      // One Block may legitimately be slow (a long drag); unlike reach, send can't know ahead, so it's a flag.
      const raw = parseCommand(`${command} send`, SEND_OPTIONS, args.slice(4)).values.timeout;
      const timeoutMs = raw === undefined ? undefined : Number(raw);
      if (timeoutMs !== undefined && !(timeoutMs > 0)) {
        console.error(`waygraph ${command} send: --timeout must be a positive number of ms, got "${raw}"`);
        process.exit(1);
      }
      return request({ op: "send", pick }, timeoutMs);
    }
    case "dom": {
      const dom = parseCommand(`${command} dom`, DOM_OPTIONS, args.slice(3)).values;
      if (dom.mode !== undefined && dom.mode !== "aria" && dom.mode !== "full") {
        console.error(`waygraph ${command} dom: --mode must be "aria" or "full", got "${dom.mode}"`);
        process.exit(1);
      }
      const depth = dom.depth === undefined ? undefined : Number(dom.depth);
      if (depth !== undefined && !(Number.isInteger(depth) && depth >= 1)) {
        console.error(`waygraph ${command} dom: --depth must be a positive integer, got "${dom.depth}"`);
        process.exit(1);
      }
      return request({
        op: "dom",
        ...(dom.mode ? { mode: dom.mode } : {}),
        ...(dom.selector ? { selector: dom.selector } : {}),
        ...(depth !== undefined ? { depth } : {}),
      });
    }
    case "watch": {
      // One JSON line per run event (steps, reads) and per new snapshot, until Ctrl-C or the session ends.
      const feed = await subscribeSession(proj, sessionId, (message) => console.log(JSON.stringify(message)));
      process.once("SIGINT", () => feed.close());
      await feed.closed;
      return;
    }
    case "read": {
      // read <id> [path] [--rows 10:30] [--where field=value ...]: rows and where narrow a list at path.
      const { values, positionals } = parseCommand(`${command} read`, READ_OPTIONS, args.slice(3));
      const path = positionals[0];
      const [from, to] = values.rows?.split(":") ?? [];
      const rows = values.rows === undefined ? undefined : { from: Number(from) || 0, ...(to ? { to: Number(to) } : {}) };
      const where = Object.fromEntries(
        (values.where ?? []).map((w) => [w.slice(0, w.indexOf("=")), w.slice(w.indexOf("=") + 1)]).filter(([field]) => field),
      );
      if ((rows || Object.keys(where).length) && !path) {
        console.error(`waygraph ${command} read: --rows / --where narrow a list - give its path (read <id> catalog.items --rows 0:10)`);
        process.exitCode = 1;
        return;
      }
      return request({ op: "read", ...(path ? { path } : {}), ...(rows ? { rows } : {}), ...(Object.keys(where).length ? { where } : {}) });
    }
    case "upload": {
      const [selector, kindOrPath] = args.slice(3, 5);
      if (selector === undefined || kindOrPath === undefined) usage(command, sub, '"<selector>" <image|pdf|video|path-to-file>');
      const stub = kindOrPath === "image" || kindOrPath === "pdf" || kindOrPath === "video" ? kindOrPath : { filePath: resolve(process.cwd(), kindOrPath) };
      return request({ op: "upload", selector, stub });
    }
    case "highlight":
      return request({ op: "highlight", ...highlightFixtures(command, args[3]) });
    default:
      return request({ op: "status" });
  }
}

/** A highlight body: JSON (`{"rings":[...]}`), or the shorthand `<selector>|<label>[|<tone>]; ...`. */
function highlightFixtures(command: string, raw: string | undefined): PilotHighlightFixtures {
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
        `waygraph ${command} highlight: body is neither valid JSON (${messageOf(jsonErr)}) nor valid shorthand (${shorthand.reason})`,
      );
      process.exit(1);
    }
    fixtures = shorthand.fixtures;
  }
  if (fixtures.op !== undefined && fixtures.op !== "highlight") {
    console.error(`waygraph ${command} highlight: do not set "op" (or set it to "highlight")`);
    process.exit(1);
  }
  const { op: _op, ...rest } = fixtures;
  return rest as PilotHighlightFixtures;
}
