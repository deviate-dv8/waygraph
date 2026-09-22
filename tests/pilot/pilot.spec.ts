import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
// Imported from dist/, not src/: AutoSession dynamically imports the real
// examples/saucedemo Blocks, which resolve "waygraph" via node_modules (a
// symlink to this package's own dist/ build) - importing this test's own
// AutoSession/MemKey-touching code from src/ instead would create two
// different MemKey classes at runtime (a real dual-module-instance problem,
// not a bug in AutoSession itself), the same reason
// tests/fixtures/inline-selector-check/ already imports from dist/.
import { pilotStart, AutoSession } from "../../dist/index.js";
import { requestSession, serveSession } from "../../dist/auto-session-ipc.js";

const sauceRoot = join(import.meta.dirname, "../../examples/saucedemo");
// Zero .block.ts files - deliberately minimal, so a session started here pays
// no unrelated detectHere/NavBlock-probing overhead. Using sauceRoot's own
// rich library (6-8 NavBlocks) for something unrelated to saucedemo is what
// first surfaced the real urlMatches timeout-override bug this file's own
// "rawUpload" describe block's tests now guard against by using this instead.
const blindPilotSiteRoot = join(import.meta.dirname, "../fixtures/blind-pilot-site");

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

test.describe("Pilot overlay (real on-page badge/panel, real saucedemo.com)", () => {
  test("badge shows the real session id and Checkpoint, panel lists the real live edges, both update after a real transition", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true, sessionId: "test-overlay-id" });
    try {
      await session.currentSnapshot();
      const badge = await session.inspectDom({ mode: "full", selector: "#wg-pilot-badge" });
      expect(badge.ok).toBe(true);
      if (badge.ok) {
        const text = JSON.stringify(badge.snapshot.tree);
        expect(text).toContain("test-overlay-id");
        expect(text).toContain("LoginPage");
      }

      const panel = await session.inspectDom({ mode: "full", selector: "#wg-pilot-panel" });
      expect(panel.ok).toBe(true);
      if (panel.ok) expect(JSON.stringify(panel.snapshot.tree)).toContain("submit-login");

      let snapshot = await session.currentSnapshot();
      await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "fill-username")!.index));
      snapshot = await session.currentSnapshot();
      await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "fill-password")!.index));
      snapshot = await session.currentSnapshot();
      await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "submit-login")!.index));

      const badgeAfter = await session.inspectDom({ mode: "full", selector: "#wg-pilot-badge" });
      if (badgeAfter.ok) expect(JSON.stringify(badgeAfter.snapshot.tree)).toContain("LoggedIn");
    } finally {
      await session.close();
    }
  });

  test("the 'All nodes' tab renders a real Mermaid flowchart, not the old flat text tree", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true, sessionId: "test-overlay-graph" });
    try {
      // currentSnapshot() is what feeds updatePilotOverlay its graph payload
      // (AutoSession.currentMenu() passes `graph: this.graph`) - a plain
      // inspectDom() alone would leave the overlay showing "No graph data
      // yet." and this test would pass for the wrong reason.
      await session.currentSnapshot();
      // The panel starts collapsed (only opens on a real badge click) -
      // the tab button is inert while hidden.
      await session["page"].locator("#wg-pilot-badge").click();
      await session["page"].locator("#wg-pilot-view-graph").click();
      // Real, direct user request: "a 2d version. left to right stuff.
      // maybe mermaid? with square ish arrows???" - assert an actual <svg>
      // landed (Mermaid rendered), not the flat-list fallback text.
      const svgHandle = await session["page"].locator("#wg-pilot-panel-graph svg").first();
      await svgHandle.waitFor({ state: "attached", timeout: 15_000 });
      const graphPanelHtml = await session["page"].locator("#wg-pilot-panel-graph").innerHTML();
      expect(graphPanelHtml).toContain("<svg");
      expect(graphPanelHtml).not.toContain("wg-pilot-graph-checkpoint"); // the old fallback's own class
      expect(graphPanelHtml).toContain("LoginPage");
    } finally {
      await session.close();
    }
  });

  test("overlay badge persists on about:blank (browser-style start)", async () => {
    test.setTimeout(20_000);
    const session = await AutoSession.start({
      projectDir: sauceRoot,
      headless: true,
      skipInitialNavigation: true,
      sessionId: "blank1234",
    });
    try {
      expect(session["page"].url()).toBe("about:blank");
      await session.currentSnapshot();
      const badge = session["page"].locator("#wg-pilot-badge");
      await badge.waitFor({ state: "attached", timeout: 5_000 });
      const text = await badge.textContent();
      expect(text).toContain("Waygraph Pilot");
      expect(text).toContain("blank1234");
      expect(text).toContain("blank page");
    } finally {
      await session.close();
    }
  });

  test("without a sessionId, the badge shows a graceful fallback, not a crash", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      await session.currentSnapshot();
      const badge = await session.inspectDom({ mode: "full", selector: "#wg-pilot-badge" });
      expect(badge.ok).toBe(true);
      if (badge.ok) expect(JSON.stringify(badge.snapshot.tree)).toContain("no session id");
    } finally {
      await session.close();
    }
  });
});

test.describe("resync (real re-detection, real saucedemo.com)", () => {
  // What this proves, and what it honestly can't: `resync` fixes a real gap
  // - `here` is only ever updated by an action AutoSession itself ran
  // (applyPick/applyPath set it; rawClick/rawType/rawGoto null it because
  // they just changed the page), so anything OUTSIDE this class touching
  // the page (a human clicking around in a visible --non-headless session
  // someone is co-driving) leaves `here` silently stale. The trigger for
  // that (something other than AutoSession's own methods changing the live
  // page) can't be reproduced here - it would need either OS-level input
  // simulation (no xdotool in this environment) or a second, independent
  // CDP client attached to the same browser (AutoSession launches without
  // an exposed remote-debugging port). What IS proven, live: resync
  // performs a real, unconditional re-detection against the real page - not
  // a cached return - both when `here` is already correct (confirms it
  // wasn't a no-op) and after a real Checkpoint transition.
  test("resync re-detects the real position, both at a fresh start and after a real transition", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      const fresh = await session.resync();
      expect(fresh.ok).toBe(true);
      if (fresh.ok) expect(fresh.snapshot.here).toBe("LoginPage");

      let snapshot = await session.currentSnapshot();
      await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "fill-username")!.index));
      snapshot = await session.currentSnapshot();
      await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "fill-password")!.index));
      snapshot = await session.currentSnapshot();
      const loginResult = await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "submit-login")!.index));
      expect(loginResult.ok).toBe(true);

      // Real re-detection after a real transition, not a stale/cached read.
      const afterLogin = await session.resync();
      expect(afterLogin.ok).toBe(true);
      if (afterLogin.ok) expect(afterLogin.snapshot.here).toBe("LoggedIn");
    } finally {
      await session.close();
    }
  });
});

test.describe("applyPath / auto reach (real multi-step routing, real saucedemo.com)", () => {
  test("reaches the target immediately (path: []) when already there", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      const result = await session.applyPath("LoginPage");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toEqual([]);
        expect(result.snapshot.here).toBe("LoginPage");
      }
    } finally {
      await session.close();
    }
  });

  test("runs a real multi-step route to a Checkpoint that needs no field-filling setup, in one call", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      // Drive real login by hand first (fill-username/fill-password/submit-login
      // are each real, individual steps - applyPath doesn't invent same-Checkpoint
      // setup steps like these itself; see the "fails loud" test below for why).
      let snapshot = await session.currentSnapshot();
      await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "fill-username")!.index));
      snapshot = await session.currentSnapshot();
      await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "fill-password")!.index));
      snapshot = await session.currentSnapshot();
      const loginResult = await session.applyPick(String(snapshot.sections.flatMap((s) => s.edges).find((e) => e.block === "submit-login")!.index));
      expect(loginResult.ok).toBe(true);

      // Now the actual proof: one applyPath call reaches CartPage from
      // LoggedIn via the real "nav-cart" wildcard edge, whose precondition
      // (being logged in) is genuinely met here - real click, real
      // navigation, one round trip instead of a hand-picked index.
      const result = await session.applyPath("CartPage");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toEqual(["nav-cart"]);
        expect(result.snapshot.here).toBe("CartPage");
      }
    } finally {
      await session.close();
    }
  });

  test("fails loud (not a hang) when a route crosses a wildcard edge whose real precondition isn't met", async () => {
    test.setTimeout(60_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      // From a fresh LoginPage, the shortest theoretical route to
      // OrderComplete goes through "nav-checkout-info" (a `from: "*"` edge,
      // only really clickable once actually on the cart page with items) -
      // findBlockPathDetailed has no live-page access and can't know its
      // real precondition isn't met yet from here. Deterministic (confirmed
      // by direct reproduction, unlike a LoginPage->LoggedIn target, which
      // depends on saucedemo.com's own live login behavior): the step's own
      // click/wait times out and throws - a real, bounded failure (~30s,
      // Playwright's own default click timeout, since "#checkout" doesn't
      // exist at all on LoginPage - not an infinite hang.
      const result = await session.applyPath("OrderComplete");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("failed");
      }
      // The session itself is still alive and usable afterward - a failed
      // route doesn't corrupt or hang the session.
      const status = await session.currentSnapshot();
      expect(status.here).toBe("LoginPage");
    } finally {
      await session.close();
    }
  });

  test("an unknown target Checkpoint is reported clearly, not a crash", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      const result = await session.applyPath("NoSuchCheckpoint");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("no Block path");
    } finally {
      await session.close();
    }
  });
});

test.describe("serveSession request-handler crash isolation (real bug, real fix)", () => {
  // Real, confirmed incident: a Playwright locator that `.count()` (which
  // does NOT auto-wait) sees as present, but that then disappears before a
  // slower call like `.evaluate()`/`ariaSnapshotJSON()` (which DOES
  // auto-wait) re-resolves it, throws an uncaught rejection - which used to
  // escape handleLine's returned promise unhandled and crash the WHOLE
  // detached session process, killing an otherwise-fine browser/page/socket
  // over one bad request. Reproduced here with a stub session (not a real
  // timing race, which is only a few ms wide against a real browser and not
  // reliably scriptable) so the test is fast and deterministic - it exercises
  // exactly the try/catch added around the op dispatch in
  // auto-session-ipc.ts, not the browser-side trigger that happened to find it.
  test("one op throwing reports an error, not a crash - the session answers the next request fine", async () => {
    test.setTimeout(15_000);
    const projectDir = mkdtempSync(join(tmpdir(), "waygraph-ipc-crash-"));
    const sessionId = "aaaaaaaa";
    let statusCalls = 0;
    const stubSession = {
      currentSnapshot: async () => {
        statusCalls += 1;
        return { here: "Stub", sections: [], done: false, lastRunNote: null };
      },
      inspectDom: async () => {
        throw new Error("simulated locator timeout (element vanished between count() and evaluate())");
      },
      applyPick: async () => ({ ok: true as const, quit: false, snapshot: await stubSession.currentSnapshot() }),
      getTrace: () => [],
      rawClick: async () => ({ ok: true as const, quit: false, snapshot: await stubSession.currentSnapshot() }),
      rawType: async () => ({ ok: true as const, quit: false, snapshot: await stubSession.currentSnapshot() }),
      rawGoto: async () => ({ ok: true as const, quit: false, snapshot: await stubSession.currentSnapshot() }),
      reloadLibrary: async () => {},
      applyPath: async () => ({ ok: true as const, path: [], snapshot: await stubSession.currentSnapshot() }),
      resync: async () => ({ ok: true as const, quit: false, snapshot: await stubSession.currentSnapshot() }),
      close: async () => {},
    };

    await serveSession(stubSession as unknown as AutoSession, projectDir, sessionId, true);

    const domRes = await requestSession(projectDir, sessionId, { op: "dom" });
    expect(domRes.ok).toBe(false);
    if (!domRes.ok) expect(domRes.error).toContain("simulated locator timeout");

    // The session process/socket must still be alive and answer normally -
    // this is the actual regression check, not the error text above.
    const statusRes = await requestSession(projectDir, sessionId, { op: "status" });
    expect(statusRes.ok).toBe(true);
    if (statusRes.ok) expect(statusRes.snapshot.here).toBe("Stub");
    expect(statusCalls).toBeGreaterThan(0);
  });
});

test.describe("rawUpload (real stub files, real bug this responds to)", () => {
  // Real, direct user request found live: Blind Pilot against veciro.com hit
  // a real avatar `<input type="file">` with no way to supply anything -
  // these are real, minimal, valid fixture files (not renamed-empty stand-
  // ins), see assets/stubs/ and stubFilePath's own comment in auto-session.ts.
  test("fills a real file input with each built-in stub kind, and with a custom path", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: blindPilotSiteRoot, headless: true });
    try {
      const dataUrl =
        "data:text/html," +
        encodeURIComponent(
          "<input type=file id=image><input type=file id=pdf><input type=file id=video>",
        );
      await session.rawGoto(dataUrl);

      for (const [id, kind] of [
        ["image", "image"],
        ["pdf", "pdf"],
        ["video", "video"],
      ] as const) {
        const result = await session.rawUpload(`#${id}`, kind);
        expect(result.ok).toBe(true);
      }

      // A caller-supplied path works too, not just the three built-ins.
      const customResult = await session.rawUpload("#image", {
        filePath: join(import.meta.dirname, "../../assets/stubs/stub.pdf"),
      });
      expect(customResult.ok).toBe(true);
    } finally {
      await session.close();
    }
  });

  test("a selector matching nothing is a reported failure, not a crash", async () => {
    test.setTimeout(15_000);
    const session = await AutoSession.start({ projectDir: blindPilotSiteRoot, headless: true });
    try {
      const result = await session.rawUpload("#does-not-exist", "image");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("no element matches selector");
    } finally {
      await session.close();
    }
  });
});

test.describe("warnUnmappedInteractions (href + button coverage-gap detection)", () => {
  // Real, direct user request: an agent driving Blind Pilot had no
  // structured signal for "this page has a link nowhere in the project's
  // own NavBlocks" - only manual DOM inspection, exactly what this whole
  // exploration had been doing by hand. sauceRoot's real login.flow.ts
  // Blocks give a real covered link (LoginPage's own nav) to prove the
  // detector does NOT warn about something it already knows, alongside a
  // genuinely unmapped one it should.
  test("warns once per unmapped same-origin link, stays silent on a real covered one, and doesn't repeat on a later call", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      // Real page, real DOM. Inject two links: one to "/" - saucedemo's
      // real root, covered by the project's own real nav-login Block - and
      // one to a genuinely fake path nothing maps, to check both the
      // negative and positive case in one pass.
      await session.rawGoto("https://www.saucedemo.com/");
      await session["page"].evaluate(() => {
        const covered = document.createElement("a");
        covered.href = "/";
        covered.textContent = "root";
        document.body.appendChild(covered);
        const uncovered = document.createElement("a");
        uncovered.href = "/this-path-has-no-navblock";
        uncovered.textContent = "nowhere";
        document.body.appendChild(uncovered);
      });

      await session.currentSnapshot();
      const log1 = session.getConsoleLog();
      const warnings1 = log1.filter((e) => e.type === "console" && e.text.includes("unmapped nav link"));
      expect(warnings1.some((w) => w.text.includes("/this-path-has-no-navblock"))).toBe(true);
      expect(warnings1.some((w) => w.text.includes("unmapped nav link on this page: / "))).toBe(false);

      // A second read must not repeat the same warning - already-flagged
      // gaps are noise on every subsequent status/send call, not new signal.
      // Counts the specific warning, not the total log length - saucedemo.com
      // is a real, uncontrolled live site that can emit its own unrelated
      // console noise (analytics, etc.) between the two reads, which isn't
      // what this assertion is about.
      const beforeWarningCount = warnings1.filter((w) => w.text.includes("/this-path-has-no-navblock")).length;
      await session.currentSnapshot();
      const log2 = session.getConsoleLog();
      const warnings2 = log2.filter(
        (e) => e.type === "console" && e.text.includes("unmapped nav link") && e.text.includes("/this-path-has-no-navblock"),
      );
      expect(warnings2.length).toBe(beforeWarningCount);
    } finally {
      await session.close();
    }
  });

  test("warns on an unmapped visible button", async () => {
    test.setTimeout(30_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      await session.rawGoto("https://www.saucedemo.com/");
      await session["page"].evaluate(() => {
        const uncovered = document.createElement("button");
        uncovered.id = "orphan-action-btn";
        uncovered.textContent = "Do orphan thing";
        document.body.appendChild(uncovered);
      });

      await session.currentSnapshot();
      const log = session.getConsoleLog();
      const buttonWarnings = log.filter((e) => e.type === "console" && e.text.includes("unmapped button"));
      expect(buttonWarnings.some((w) => w.text.includes("#orphan-action-btn"))).toBe(true);
      // Real saucedemo #login-button is covered via login.sel.ts — must not warn.
      expect(buttonWarnings.some((w) => w.text.includes("#login-button"))).toBe(false);
    } finally {
      await session.close();
    }
  });
});
