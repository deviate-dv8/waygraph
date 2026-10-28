/**
 * Unix-socket transport for `waygraph auto --cli --detach` / `send` / `status` /
 * `attach`. Session identity lives under a per-project `.waygraph-auto/`
 * directory, mirroring the existing `.waygraph-traverse/` dotdir convention.
 * See openspec/changes/waygraph-auto-cli-session-control.
 */
import { spawn } from "node:child_process";
import {
    mkdirSync,
    openSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { connect, createServer, type Socket } from "node:net";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import type { PilotHighlightFixtures } from "../../demo/overlay/pilot/fixtures.js";
import { ignorePageGone } from "../../engine/page-gone.js";
import { AutoSession } from "./auto-session.js";
import { generateSessionId, isPidAlive, logPathFor, metaPath, readSessionMeta, removeSessionFiles, resolveSessionMeta, sessionDir, SessionMeta, socketDir, socketPathFor, writeGlobalSessionMeta } from "./files.js";
import { type AutoSessionInit, type InspectDomOptions, type SessionSnapshot, type StubFileKind } from "./helpers.js";
import { createFeed } from "./feed.js";
import { SESSION_PROTOCOL_VERSION } from "./protocol.js";
import type { HelloResponse, ConsoleResponse, DomResponse, HighlightResponse, ReachResponse, ReadResponse, SessionRequest, SessionResponse, StatusOrSendResponse, StorageResponse, TraceResponse } from "./protocol.js";

/** Reads newline-delimited JSON off a socket, one message at a time. */
function readOneMessage<T>(sock: Socket, timeoutMs: number): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    let buf = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out after ${timeoutMs}ms waiting for a response`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      const line = buf.slice(0, nl);
      cleanup();
      try {
        resolvePromise(JSON.parse(line) as T);
      } catch (err) {
        reject(new Error(`malformed response: ${err instanceof Error ? err.message : String(err)}`));
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("connection closed before a response arrived"));
    };
    function cleanup() {
      clearTimeout(timer);
      sock.off("data", onData);
      sock.off("error", onError);
      sock.off("close", onClose);
    }
    sock.on("data", onData);
    sock.on("error", onError);
    sock.on("close", onClose);
  });
}

/**
 * Client-side: sends one request to a running session and returns its
 * response. Reports a stale/unreachable session as an error within
 * `timeoutMs`, never hangs indefinitely.
 */
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request:
    | { op: "status" }
    | { op: "send"; pick: string }
    | { op: "click"; selector: string }
    | { op: "type"; selector: string; text: string }
    | { op: "press"; selector: string; key: string }
    | { op: "goto"; url: string }
    | { op: "reload" }
    | { op: "resync" }
    | { op: "upload"; selector: string; stub: StubFileKind | { filePath: string } },
  timeoutMs?: number,
): Promise<StatusOrSendResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "dom" } & InspectDomOptions,
  timeoutMs?: number,
): Promise<DomResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "trace" },
  timeoutMs?: number,
): Promise<TraceResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "console" },
  timeoutMs?: number,
): Promise<ConsoleResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "storage" },
  timeoutMs?: number,
): Promise<StorageResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "hello" },
  timeoutMs?: number,
): Promise<HelloResponse | { ok: false; error: string }>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "read"; path?: string; rows?: { from: number; to?: number }; where?: Record<string, string> },
  timeoutMs?: number,
): Promise<ReadResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "reach"; checkpoint: string },
  timeoutMs?: number,
): Promise<ReachResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: { op: "highlight" } & PilotHighlightFixtures,
  timeoutMs?: number,
): Promise<HighlightResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: SessionRequest,
  timeoutMs = 15_000,
): Promise<SessionResponse> {
  const meta = resolveSessionMeta(sessionId, projectDir);
  if (!meta) {
    return {
      ok: false,
      error:
        `no such session "${sessionId}" (no metadata under ${projectDir}/.waygraph-auto/ or global registry) — ` +
        "run from the project that started the session, or `waygraph pilot sessions` to list live ids",
    };
  }
  if (!isPidAlive(meta.pid)) {
    removeSessionFiles(meta.projectDir, sessionId);
    return {
      ok: false,
      error: `session "${sessionId}" is not running (pid ${meta.pid} exited) — start a new session with pilot/browser start`,
    };
  }
  return new Promise((resolvePromise) => {
    const sock = connect(meta.socketPath);
    const connectTimer = setTimeout(() => {
      sock.destroy();
      resolvePromise({ ok: false, error: `session "${sessionId}" is unreachable (socket did not respond)` });
    }, timeoutMs);
    sock.on("connect", () => {
      sock.write(JSON.stringify(request) + "\n");
    });
    sock.on("error", () => {
      clearTimeout(connectTimer);
      resolvePromise({
        ok: false,
        error: `session "${sessionId}" is unreachable (stale socket - the process may have crashed)`,
      });
    });
    readOneMessage<SessionResponse>(sock, timeoutMs)
      .then((res) => {
        clearTimeout(connectTimer);
        resolvePromise(res);
      })
      .catch((err) => {
        clearTimeout(connectTimer);
        resolvePromise({ ok: false, error: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => sock.end());
  });
}

/**
 * Server-side: runs `session` behind a unix socket at
 * `.waygraph-auto/<sessionId>.sock`, writing session metadata only once the
 * socket is actually listening (the metadata file's existence is the
 * "session is ready" signal a spawning parent polls for). Requests are
 * processed one at a time via a queue - Node's single-threaded event loop
 * already prevents true parallelism, but two overlapping `await`-heavy
 * handlers could still interleave against the same page/mem.
 */
export async function serveSession(
  session: AutoSession,
  projectDir: string,
  sessionId: string,
  headless = true,
  /** After a quit closed the session and removed its files: the session process exits here. */
  onShutdown: () => void = () => {},
): Promise<void> {
  mkdirSync(sessionDir(projectDir), { recursive: true });
  mkdirSync(socketDir(), { recursive: true });
  const socketPath = socketPathFor(sessionId);
  rmSync(socketPath, { force: true });

  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  const feed = createFeed();
  const server = createServer((sock) => {
    let buf = "";
    sock.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        void handleLine(line, sock);
      }
    });
  });

  async function handleLine(line: string, sock: Socket): Promise<void> {
    let request: SessionRequest;
    try {
      request = JSON.parse(line) as SessionRequest;
    } catch {
      sock.write(JSON.stringify({ ok: false, error: "malformed request (invalid JSON)" }) + "\n");
      return;
    }
    // Neither waits behind a running request: hello names the protocol, subscribe turns this socket into a live feed.
    if (request.op === "hello") {
      sock.write(JSON.stringify({ ok: true, protocol: SESSION_PROTOCOL_VERSION, waygraph: waygraphVersion(), sessionId, here: session.where }) + "\n");
      return;
    }
    if (request.op === "subscribe") {
      feed.add(sock);
      return;
    }
    await enqueue(async () => {
      let response: SessionResponse;
      let shouldQuit = false;
      try {
        if (request.op === "status") {
          response = { ok: true, snapshot: await session.currentSnapshot(), quit: false };
        } else if (request.op === "send") {
          const result = await session.applyPick(request.pick);
          response = result.ok
            ? { ok: true, snapshot: result.snapshot, quit: result.quit }
            : { ok: false, error: result.error };
          shouldQuit = result.ok && result.quit;
        } else if (request.op === "dom") {
          const { op: _op, ...domOpts } = request;
          response = await session.inspectDom(domOpts);
        } else if (request.op === "trace") {
          response = { ok: true, trace: session.getTrace() };
        } else if (request.op === "console") {
          response = { ok: true, consoleLog: session.getConsoleLog() };
        } else if (request.op === "read") {
          response = { ok: true, ...(await session.read(request.path, { rows: request.rows, where: request.where })) };
        } else if (request.op === "storage") {
          response = { ok: true, ...(await session.inspectStorage()) };
        } else if (request.op === "upload") {
          response = await session.rawUpload(request.selector, request.stub);
        } else if (request.op === "click") {
          response = await session.rawClick(request.selector);
        } else if (request.op === "type") {
          response = await session.rawType(request.selector, request.text);
        } else if (request.op === "press") {
          response = await session.rawPress(request.selector, request.key);
        } else if (request.op === "goto") {
          response = await session.rawGoto(request.url);
        } else if (request.op === "reload") {
          await session.reloadLibrary();
          response = { ok: true, snapshot: await session.currentSnapshot(), quit: false };
        } else if (request.op === "reach") {
          response = await session.applyPath(request.checkpoint);
        } else if (request.op === "resync") {
          response = await session.resync();
        } else if (request.op === "highlight") {
          const { op: _op, ...fixtures } = request;
          response = await session.applyHighlight(fixtures);
        } else {
          response = { ok: false, error: `unknown op "${(request as { op: string }).op}"` };
        }
      } catch (err) {
        // Real, confirmed bug this fixes: an uncaught rejection here (e.g. a
        // Playwright locator timing out because the element it found a
        // moment ago - via `.count()`, which does NOT auto-wait - is gone by
        // the time a slower call like `.evaluate()` re-resolves it, which
        // DOES auto-wait) used to escape `handleLine`'s returned promise
        // uncaught, crashing the whole detached session process on a single
        // bad request. One request failing must never take the rest of the
        // still-live session (browser/page/socket) down with it.
        response = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      sock.write(JSON.stringify(response) + "\n");
      // Whatever changed (a step ran, a reload, a raw action): subscribers get the new snapshot.
      if (response.ok && "snapshot" in response && "sections" in response.snapshot) feed.send({ type: "snapshot", snapshot: response.snapshot });
      if (shouldQuit) {
        setImmediate(() => void shutdown());
      }
    });
  }

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    feed.close();
    await session.close().catch(ignorePageGone);
    removeSessionFiles(projectDir, sessionId);
    onShutdown();
  }

  await new Promise<void>((resolvePromise, reject) => {
    server.on("error", reject);
    server.listen(socketPath, resolvePromise);
  });

  const meta: SessionMeta = {
    sessionId,
    socketPath,
    pid: process.pid,
    projectDir,
    startedAt: new Date().toISOString(),
    headless,
  };
  writeFileSync(metaPath(projectDir, sessionId), JSON.stringify(meta, null, 2));
  writeGlobalSessionMeta(meta);

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

/** Entry point for the hidden `__auto-serve` CLI command (runs in the detached child). */
export async function runAutoServeCommand(init: AutoSessionInit, sessionId: string): Promise<void> {
  const session = await AutoSession.start({ ...init, sessionId });
  await serveSession(session, init.projectDir, sessionId, init.headless ?? true, () => process.exit(0));
  // Tell the parent that spawned us (spawnDetachedSession) we are serving, then let it go.
  process.send?.({ ready: true });
  process.disconnect?.();
  // Keep the event loop alive - the listening server already does this,
  // but await forever here documents the intent for a reader.
  await new Promise(() => {});
}

/**
 * The waygraph a session runs on: the project's own install when it has one, else this one. Like the runner (see
 * cli/run-chain.ts), a session imports the project's Block files, and they load the project's @playwright/test; this
 * copy's would be a second one in the same process ("Requiring @playwright/test second time").
 */
function sessionPackageRoot(projectDir: string): string {
  try {
    // <root>/dist/index.js
    return dirname(dirname(createRequire(join(projectDir, "package.json")).resolve("waygraph")));
  } catch {
    // This file compiles to dist/live/auto-session/ipc.js - three levels down from the package root.
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  }
}


/**
 * Parent-side: spawns a detached background process running the same
 * explore session as a socket server, waits for it to say it is serving (one
 * message over an IPC channel, then disconnect), and returns its identity. A
 * child that exits or stays silent past the timeout fails the start, and a silent
 * one is stopped. Recurses through the
 * existing `bin/waygraph` launcher (same tsx/esm registration every other
 * invocation already gets) with the hidden `__auto-serve` command, rather
 * than re-implementing that resolution here.
 */
export async function spawnDetachedSession(
  init: AutoSessionInit,
  readyTimeoutMs = 20_000,
): Promise<SessionMeta> {
  const sessionId = generateSessionId();
  mkdirSync(sessionDir(init.projectDir), { recursive: true });
  const pkgRoot = sessionPackageRoot(init.projectDir);
  const require = createRequire(join(pkgRoot, "package.json"));
  const tsxEsm = require.resolve("tsx/esm");
  const cli = join(pkgRoot, "dist", "cli", "cli.js");
  const logFd = openSync(logPathFor(init.projectDir, sessionId), "a");
  const args = ["--import", tsxEsm, cli, "__auto-serve", init.projectDir, "--session-id", sessionId];
  if (init.baseURL) args.push("--base-url", init.baseURL);
  if (init.startUrl) args.push("--goto", init.startUrl);
  if (init.skipInitialNavigation) args.push("--blank");
  if (init.headless === false) args.push("--non-headless");
  if (init.headless === true) args.push("--headless");
  for (const p of init.inject ?? []) {
    args.push("--inject", p);
  }
  // Spawn cli.js directly — not bin/waygraph (which would fork a second Node).
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd, "ipc"],
    windowsHide: true,
    env: process.env,
  });
  const log = logPathFor(init.projectDir, sessionId);
  const outcome = await new Promise<"ready" | "timeout" | { exit: number | null }>((done) => {
    const timer = setTimeout(() => done("timeout"), readyTimeoutMs);
    child.once("message", () => (clearTimeout(timer), done("ready")));
    child.once("exit", (code) => (clearTimeout(timer), done({ exit: code })));
  });
  if (child.connected) child.disconnect();
  child.unref();
  if (outcome === "timeout") {
    child.kill("SIGTERM");
    throw new Error(`session "${sessionId}" did not become ready within ${readyTimeoutMs}ms (stopped it) - check ${log} for errors`);
  }
  if (outcome !== "ready") throw new Error(`session "${sessionId}" exited (code ${outcome.exit}) before it was ready - check ${log}`);
  const meta = readSessionMeta(init.projectDir, sessionId);
  if (!meta) throw new Error(`session "${sessionId}" said it was ready but wrote no metadata - check ${log}`);
  return meta;
}

function printSnapshotMenu(snapshot: SessionSnapshot): void {
  console.log("");
  console.log(`You are here: ${snapshot.here ?? "Unknown (pick Start here)"}`);
  if (snapshot.lastRunNote) console.log(snapshot.lastRunNote);
  console.log("");
  if (snapshot.done) {
    console.log("  (no moves available on this page)");
  }
  for (const section of snapshot.sections) {
    console.log(`  -- ${section.title} --`);
    for (const edge of section.edges) {
      if (edge.label) {
        console.log(`  [${edge.index}] ${edge.label}`);
      } else {
        const desc = edge.description ? ` - ${edge.description}` : "";
        console.log(`  [${edge.index}] ${edge.block} (${edge.kind}) -> ${edge.to}${desc}`);
      }
    }
  }
  console.log("  [q] quit");
  console.log("");
}

/**
 * Client-only interactive loop against a running detached session - reopens
 * the same rendering/parsing the foreground `--cli` loop uses, driven purely
 * through `status`/`send`. No server-side support beyond those two ops.
 */
export async function runAttachLoop(projectDir: string, sessionId: string): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    for (;;) {
      const statusRes = await requestSession(projectDir, sessionId, { op: "status" });
      if (!statusRes.ok) {
        console.error(`waygraph auto attach: ${statusRes.error}`);
        return;
      }
      printSnapshotMenu(statusRes.snapshot);
      const ans = await rl.question("Choose: ");
      const sendRes = await requestSession(projectDir, sessionId, { op: "send", pick: ans });
      if (!sendRes.ok) {
        console.error(`waygraph auto attach: ${sendRes.error}`);
        continue;
      }
      if (sendRes.quit) {
        console.error("waygraph auto attach: session quit.");
        return;
      }
    }
  } finally {
    rl.close();
  }
}

/** This package's version, for `hello` (the file sits three levels below the package root in src/ and dist/). */
function waygraphVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json"), "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
}
