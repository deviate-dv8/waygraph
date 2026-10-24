// Where a detached session lives on disk: its metadata (per project, plus a global copy keyed by id), its short
// socket path under the OS temp folder, its log; and listing, resolving and stopping sessions by id.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SessionMeta {
  sessionId: string;
  socketPath: string;
  pid: number;
  projectDir: string;
  startedAt: string;
  headless: boolean;
}
export function sessionDir(projectDir: string): string {
  return join(projectDir, ".waygraph-auto");
}
export function metaPath(projectDir: string, sessionId: string): string {
  return join(sessionDir(projectDir), `${sessionId}.json`);
}
/** Global index so session control works even when cwd ≠ the project that spawned the session. */
export function globalMetaPath(sessionId: string): string {
  return join(socketDir(), `${sessionId}.meta.json`);
}
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
/**
 * Deliberately NOT under the project directory (unlike meta/log files) -
 * a real bug found while proving out openspec/changes/waygraph-map's own
 * "waypack" loading claim: a project loaded through a consumer's own deeply
 * nested `node_modules/<pkg>` path can push the socket's absolute path past
 * the OS's AF_UNIX `sun_path` limit (~108 bytes on Linux), failing with
 * `listen EINVAL`. A short, fixed-location directory sidesteps this
 * regardless of how deep `projectDir` itself is nested. `sessionId` alone
 * (8 hex chars, `generateSessionId()`) is enough to keep this collision-safe
 * across every project on the machine sharing this one flat directory - the
 * same randomness space this package already relied on per-project.
 */

export function socketDir(): string {
  return join(tmpdir(), "waygraph-auto");
}
export function socketPathFor(sessionId: string): string {
  return join(socketDir(), `${sessionId}.sock`);
}
export function logPathFor(projectDir: string, sessionId: string): string {
  return join(sessionDir(projectDir), `${sessionId}.log`);
}
export function generateSessionId(): string {
  return randomBytes(4).toString("hex");
}
export function readSessionMeta(projectDir: string, sessionId: string): SessionMeta | null {
  const p = metaPath(projectDir, sessionId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as SessionMeta;
  } catch {
    return null;
  }
}
/**
 * Resolve session metadata from a project hint (cwd) or the global registry.
 * Fixes "session unreachable" when the agent calls status/send from a different
 * directory or pane than the one that ran `pilot start`.
 */

export function resolveSessionMeta(sessionId: string, projectDirHint?: string): SessionMeta | null {
  if (projectDirHint) {
    const local = readSessionMeta(projectDirHint, sessionId);
    if (local) return local;
  }
  const globalPath = globalMetaPath(sessionId);
  if (existsSync(globalPath)) {
    try {
      return JSON.parse(readFileSync(globalPath, "utf-8")) as SessionMeta;
    } catch {
      return null;
    }
  }
  return null;
}
export function writeGlobalSessionMeta(meta: SessionMeta): void {
  mkdirSync(socketDir(), { recursive: true });
  writeFileSync(globalMetaPath(meta.sessionId), JSON.stringify(meta, null, 2));
}
export function removeSessionFiles(projectDir: string, sessionId: string): void {
  for (const p of [
    metaPath(projectDir, sessionId),
    globalMetaPath(sessionId),
    socketPathFor(sessionId),
  ]) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
}
/** Stop one detached session (SIGTERM + cleanup metadata/socket). */

export function stopBrowserSession(projectDir: string, sessionId: string): boolean {
  const meta = resolveSessionMeta(sessionId, projectDir);
  if (!meta) return false;
  try {
    process.kill(meta.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  removeSessionFiles(meta.projectDir, sessionId);
  return true;
}
/** Stop every live session registered for a project. */

export function stopAllBrowserSessions(projectDir: string): number {
  const sessions = listBrowserSessions(projectDir);
  for (const meta of sessions) {
    stopBrowserSession(meta.projectDir, meta.sessionId);
  }
  return sessions.length;
}
/** Live browser sessions for a project (metadata + socket + pid still present). */

export function listBrowserSessions(projectDir: string): SessionMeta[] {
  const dir = sessionDir(projectDir);
  if (!existsSync(dir)) return [];
  const out: SessionMeta[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const id = f.slice(0, -".json".length);
    const meta = readSessionMeta(projectDir, id);
    if (!meta) continue;
    if (!existsSync(socketPathFor(id))) continue;
    if (!isPidAlive(meta.pid)) {
      removeSessionFiles(projectDir, id);
      continue;
    }
    out.push(meta);
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
