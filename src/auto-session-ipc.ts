/**
 * Unix-socket transport for `waygraph auto --cli --detach` / `send` / `status` /
 * `attach`. Session identity lives under a per-project `.waygraph-auto/`
 * directory, mirroring the existing `.waygraph-traverse/` dotdir convention.
 * See openspec/changes/waygraph-auto-cli-session-control.
 */
import { createServer, connect, type Socket } from "node:net";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  openSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  AutoSession,
  type AutoSessionInit,
  type SessionSnapshot,
  type InspectDomOptions,
  type DomSnapshot,
  type TraceStep,
  type ApplyPathResult,
} from "./auto-session.js";

export interface SessionMeta {
  sessionId: string;
  socketPath: string;
  pid: number;
  projectDir: string;
  startedAt: string;
  headless: boolean;
}

type ServerRequest =
  | { op: "status" }
  | { op: "send"; pick: string }
  | ({ op: "dom" } & InspectDomOptions)
  | { op: "trace" }
  | { op: "click"; selector: string }
  | { op: "type"; selector: string; text: string }
  | { op: "goto"; url: string }
  | { op: "reload" }
  | { op: "reach"; checkpoint: string };

export type StatusOrSendResponse =
  | { ok: true; snapshot: SessionSnapshot; quit: boolean }
  | { ok: false; error: string };

export type DomResponse = { ok: true; snapshot: DomSnapshot } | { ok: false; error: string };

export type TraceResponse = { ok: true; trace: TraceStep[] } | { ok: false; error: string };

export type ReachResponse = ApplyPathResult;

type ServerResponse = StatusOrSendResponse | DomResponse | TraceResponse | ReachResponse;

function sessionDir(projectDir: string): string {
  return join(projectDir, ".waygraph-auto");
}

function metaPath(projectDir: string, sessionId: string): string {
  return join(sessionDir(projectDir), `${sessionId}.json`);
}

function socketPathFor(projectDir: string, sessionId: string): string {
  return join(sessionDir(projectDir), `${sessionId}.sock`);
}

function logPathFor(projectDir: string, sessionId: string): string {
  return join(sessionDir(projectDir), `${sessionId}.log`);
}

function generateSessionId(): string {
  return randomBytes(4).toString("hex");
}

function readSessionMeta(projectDir: string, sessionId: string): SessionMeta | null {
  const p = metaPath(projectDir, sessionId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as SessionMeta;
  } catch {
    return null;
  }
}

function removeSessionFiles(projectDir: string, sessionId: string): void {
  for (const p of [
    metaPath(projectDir, sessionId),
    socketPathFor(projectDir, sessionId),
  ]) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
}

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
    | { op: "goto"; url: string }
    | { op: "reload" },
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
  request: { op: "reach"; checkpoint: string },
  timeoutMs?: number,
): Promise<ReachResponse>;
export async function requestSession(
  projectDir: string,
  sessionId: string,
  request: ServerRequest,
  timeoutMs = 15_000,
): Promise<ServerResponse> {
  const meta = readSessionMeta(projectDir, sessionId);
  if (!meta) {
    return { ok: false, error: `no such session "${sessionId}" (no metadata under .waygraph-auto/)` };
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
    readOneMessage<ServerResponse>(sock, timeoutMs)
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
): Promise<void> {
  mkdirSync(sessionDir(projectDir), { recursive: true });
  const socketPath = socketPathFor(projectDir, sessionId);
  rmSync(socketPath, { force: true });

  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

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
    let request: ServerRequest;
    try {
      request = JSON.parse(line) as ServerRequest;
    } catch {
      sock.write(JSON.stringify({ ok: false, error: "malformed request (invalid JSON)" }) + "\n");
      return;
    }
    await enqueue(async () => {
      let response: ServerResponse;
      let shouldQuit = false;
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
      } else if (request.op === "click") {
        response = await session.rawClick(request.selector);
      } else if (request.op === "type") {
        response = await session.rawType(request.selector, request.text);
      } else if (request.op === "goto") {
        response = await session.rawGoto(request.url);
      } else if (request.op === "reload") {
        await session.reloadLibrary();
        response = { ok: true, snapshot: await session.currentSnapshot(), quit: false };
      } else if (request.op === "reach") {
        response = await session.applyPath(request.checkpoint);
      } else {
        response = { ok: false, error: `unknown op "${(request as { op: string }).op}"` };
      }
      sock.write(JSON.stringify(response) + "\n");
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
    await session.close().catch(() => {});
    removeSessionFiles(projectDir, sessionId);
    process.exit(0);
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

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

/** Entry point for the hidden `__auto-serve` CLI command (runs in the detached child). */
export async function runAutoServeCommand(init: AutoSessionInit, sessionId: string): Promise<void> {
  const session = await AutoSession.start(init);
  await serveSession(session, init.projectDir, sessionId, init.headless ?? true);
  // Keep the event loop alive - the listening server already does this,
  // but await forever here documents the intent for a reader.
  await new Promise(() => {});
}

/**
 * Parent-side: spawns a detached background process running the same
 * explore session as a socket server, waits for it to signal readiness (its
 * metadata file appearing), and returns its identity. Recurses through the
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
  const launcher = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "waygraph");
  const logFd = openSync(logPathFor(init.projectDir, sessionId), "a");
  const args = ["__auto-serve", init.projectDir, "--session-id", sessionId];
  if (init.baseURL) args.push("--base-url", init.baseURL);
  if (init.headless === false) args.push("--non-headless");
  const child = spawn(process.execPath, [launcher, ...args], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  child.unref();

  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    const meta = readSessionMeta(init.projectDir, sessionId);
    if (meta) return meta;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `session "${sessionId}" did not become ready within ${readyTimeoutMs}ms - ` +
      `check ${logPathFor(init.projectDir, sessionId)} for errors`,
  );
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
