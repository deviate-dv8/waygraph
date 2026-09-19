/**
 * Waygraph Pilot: the one bootstrap call an agent needs to start driving a
 * real, persistent, inspectable browser session toward a natural-language
 * goal it plans and executes itself.
 *
 * Deliberately NOT a resolver that maps one ask to one Block
 * (`resolveAsk`/`pilotNarrate`/`pilotAct`, the v1 shape this replaced - see
 * git tag `waygraph-pilot-v1-logs-prettified` for that history). Real
 * requests are multi-step ("log in and buy the backpack for me", "make a
 * signature draft request") and need an agent that plans a whole sequence
 * against the graph, not a single best-matching edge. `pilotStart` does not
 * plan, resolve, narrate, or act on anything - it only combines two
 * already-proven, separately-existing primitives into one payload:
 *
 * - `spawnDetachedSession` (same mechanism as `auto --cli --detach`) - a
 *   real, persistent, visible-if-headful Playwright session an agent can
 *   keep driving across many calls, not a fresh session per request.
 * - `discoverGraph` (same mechanism as `waygraph graph`) - the WHOLE
 *   project's Checkpoint/edge/description graph, not just what's reachable
 *   from the session's current position, because planning a multi-step
 *   route needs to see steps ahead, not just the next one.
 *
 * Driving the session afterward - `auto send <id> "<pick>"`, `auto status
 * <id>`, `auto dom <id>`, `auto trace <id>` - is left entirely to whatever
 * agent is holding it. All four already existed before this file did; see
 * openspec/changes/waygraph-pilot/design.md for the worked example (a real
 * login + add-to-cart + checkout run against examples/saucedemo, driven by
 * hand-picking indices from each status response) that proved this needs no
 * new execution primitive.
 */
import { discoverGraph, type WaygraphGraph } from "./graph.js";
import { spawnDetachedSession, requestSession } from "./auto-session-ipc.js";
import type { AutoSessionInit, SessionSnapshot } from "./auto-session.js";

export interface PilotStartResult {
  sessionId: string;
  socketPath: string;
  headless: boolean;
  /** The whole project's Block graph - every Checkpoint/edge/description, not just what's reachable right now. */
  graph: WaygraphGraph;
  /** The session's starting position, or `null` if the very first `status` read failed. */
  snapshot: SessionSnapshot | null;
}

/**
 * Starts a detached session and reads back its own graph + starting
 * snapshot in one call, so an agent bootstraps with everything it needs
 * (a live session it can keep driving, and the full map of what exists) in
 * one round trip instead of separately knowing to chain `auto --cli
 * --detach` and `waygraph graph` itself.
 */
export async function pilotStart(init: AutoSessionInit): Promise<PilotStartResult> {
  const [meta, graph] = await Promise.all([
    spawnDetachedSession(init),
    discoverGraph(init.projectDir),
  ]);
  const status = await requestSession(init.projectDir, meta.sessionId, { op: "status" });
  return {
    sessionId: meta.sessionId,
    socketPath: meta.socketPath,
    headless: meta.headless,
    graph,
    snapshot: status.ok ? status.snapshot : null,
  };
}
