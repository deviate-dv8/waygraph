// The session protocol: what a client (the CLI, an agent, Waygraph UI) sends a live session and gets back. Newline-
// delimited JSON over the session's socket; `hello` names the version, `subscribe` keeps the socket open as a live feed.
import type { PilotHighlightFixtures } from "../../demo/overlay/pilot/fixtures.js";
import type { RunEvent } from "../../engine/run/events.js";
import type { ApplyPathResult, ConsoleLogEntry, DomSnapshot, InspectDomOptions, SessionSnapshot, StorageSnapshot, StubFileKind, TraceStep } from "./helpers.js";
import type { SessionRead } from "./read.js";

/** Bumped when a request or response changes shape (adding an op or an optional field does not). */
export const SESSION_PROTOCOL_VERSION = 1;

/** Every request a session answers. */
export type SessionRequest =
  | { op: "hello" }
  | { op: "subscribe" }
  | { op: "status" }
  | { op: "send"; pick: string; data?: Record<string, unknown> }
  | ({ op: "dom" } & InspectDomOptions)
  | { op: "trace" }
  | { op: "click"; selector: string }
  | { op: "type"; selector: string; text: string }
  | { op: "press"; selector: string; key: string }
  | { op: "goto"; url: string }
  | { op: "reload" }
  | { op: "reach"; checkpoint: string; data?: Record<string, unknown> }
  | { op: "resync" }
  | { op: "console" }
  | { op: "storage" }
  | { op: "read"; path?: string; rows?: { from: number; to?: number }; where?: Record<string, string> }
  | { op: "upload"; selector: string; stub: StubFileKind | { filePath: string } }
  | ({ op: "highlight" } & PilotHighlightFixtures);

export type StatusOrSendResponse =
  | { ok: true; snapshot: SessionSnapshot; quit: boolean }
  | { ok: false; error: string };

export type DomResponse = { ok: true; snapshot: DomSnapshot } | { ok: false; error: string };

export type TraceResponse = { ok: true; trace: TraceStep[] } | { ok: false; error: string };

export type ConsoleResponse = { ok: true; consoleLog: ConsoleLogEntry[] } | { ok: false; error: string };

export type StorageResponse = ({ ok: true } & StorageSnapshot) | { ok: false; error: string };

export type ReachResponse = ApplyPathResult;

export type ReadResponse = ({ ok: true } & SessionRead) | { ok: false; error: string };

export type HighlightResponse =
  | { ok: true; painted: number; missing: string[]; snapshot: SessionSnapshot }
  | { ok: false; error: string };

/** What `hello` answers: the protocol a client is talking to, and where the session is (`null` until a status or step has located it). */
export type HelloResponse = { ok: true; protocol: number; waygraph: string; sessionId: string; here: string | null };

/** One line of a `subscribe` feed: every run event in the session (steps, reads), and the snapshot after each change. */
export type SessionStreamMessage =
  | { type: "event"; event: RunEvent }
  | { type: "snapshot"; snapshot: SessionSnapshot };

export type SessionResponse =
  | HelloResponse
  | StatusOrSendResponse
  | DomResponse
  | TraceResponse
  | ConsoleResponse
  | StorageResponse
  | ReachResponse
  | ReadResponse
  | HighlightResponse;

/** Every op, once: the server, the CLI and `pilot` all check against this list. */
export const SESSION_OPS = ["hello", "subscribe", "status", "send", "dom", "trace", "console", "storage", "read", "upload", "click", "type", "press", "goto", "reload", "reach", "resync", "highlight"] as const;

/** Compile-time check that SESSION_OPS names every request op and nothing else. */
type MissingOp = Exclude<SessionRequest["op"], (typeof SESSION_OPS)[number]>;
type UnknownOp = Exclude<(typeof SESSION_OPS)[number], SessionRequest["op"]>;
const complete: [MissingOp, UnknownOp] extends [never, never] ? true : never = true;
void complete;
