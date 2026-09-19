import { test, expect } from "@playwright/test";
import { join } from "node:path";
// Imported from dist/, not src/: AutoSession dynamically imports the real
// examples/saucedemo Blocks, which resolve "waygraph" via node_modules (a
// symlink to this package's own dist/ build) - importing this test's own
// AutoSession/MemKey-touching code from src/ instead would create two
// different MemKey classes at runtime (a real dual-module-instance problem,
// not a bug in AutoSession itself), the same reason
// tests/fixtures/inline-selector-check/ already imports from dist/.
import { pilotStart } from "../../dist/index.js";
import { requestSession } from "../../dist/auto-session-ipc.js";

const sauceRoot = join(import.meta.dirname, "../../examples/saucedemo");

test.describe("pilotStart (real spawnDetachedSession + discoverGraph, real saucedemo.com)", () => {
  // No directory-level cleanup here: .waygraph-auto/ is shared by every
  // concurrent Playwright worker (each session gets its own random id/socket
  // within it), so recursively deleting the whole dir in afterEach races
  // with a sibling test's still-running session - each test below quits its
  // own session explicitly via "q" instead, which self-removes just that
  // session's own metadata/socket files (auto-session-ipc.ts's own cleanup).

  test("returns a real running session id plus the whole project graph in one call", async () => {
    test.setTimeout(30_000);
    const result = await pilotStart({ projectDir: sauceRoot, headless: true });
    try {
      expect(result.sessionId).toMatch(/^[0-9a-f]{8}$/);
      expect(result.socketPath).toContain(result.sessionId);
      expect(result.headless).toBe(true);

      // The graph is the WHOLE project (waygraph graph's own output), not
      // just what's reachable from the starting position - proves an agent
      // gets steps-ahead planning context, not a scoped-down menu.
      const checkpointNames = result.graph.nodes.map((n) => n.checkpoint);
      expect(checkpointNames).toEqual(
        expect.arrayContaining(["LoginPage", "LoggedIn", "ItemInCart", "CartPage", "CheckoutInfoPage", "OrderComplete"]),
      );
      expect(result.graph.edges.some((e) => e.block === "finish-order")).toBe(true);

      // The session is real and already running - status reads its actual starting position.
      expect(result.snapshot?.here).toBe("LoginPage");
    } finally {
      await requestSession(sauceRoot, result.sessionId, { op: "send", pick: "q" });
    }
  });

  test("the session stays alive after pilotStart returns - a caller can keep driving it via auto send/status", async () => {
    test.setTimeout(30_000);
    const result = await pilotStart({ projectDir: sauceRoot, headless: true });
    try {
      // Drive it exactly the way an external agent would: pick "fill-username"'s
      // index from the snapshot pilotStart already returned, no new execution
      // primitive involved - auto send already does this for a human today.
      const usernameEdge = result.snapshot!.sections
        .flatMap((s) => s.edges)
        .find((e) => e.block === "fill-username")!;
      const sendRes = await requestSession(sauceRoot, result.sessionId, {
        op: "send",
        pick: String(usernameEdge.index),
      });
      expect(sendRes.ok).toBe(true);
      if (sendRes.ok) expect(sendRes.snapshot.lastRunNote).toContain("fill-username");

      const statusRes = await requestSession(sauceRoot, result.sessionId, { op: "status" });
      expect(statusRes.ok).toBe(true);
      if (statusRes.ok) expect(statusRes.snapshot.here).toBe("LoginPage");
    } finally {
      await requestSession(sauceRoot, result.sessionId, { op: "send", pick: "q" });
    }
  });
});
