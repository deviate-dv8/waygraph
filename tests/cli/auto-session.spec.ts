import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Proof for openspec/changes/waygraph-auto-cli-session-control: a fully
 * non-interactive sequence (detach, several sends, status, quit) against
 * examples/saucedemo, asserting on the JSON responses - no TTY involved.
 * This is the actual reported pain point ("waygraph auto --cli is
 * incredibly lacking with input stuffs") being fixed.
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const sauceRoot = join(import.meta.dirname, "../../examples/saucedemo");
const autoDir = join(sauceRoot, ".waygraph-auto");

/**
 * Real incident this fixed, not a theoretical concern: a blanket
 * `rmSync(autoDir, {recursive:true})` deleted a genuinely live, human
 * -important `--non-headless` Pilot session's own `<id>.json` as collateral
 * damage, because this suite ran against the same project directory that
 * session was using. The session's browser/socket survived (sockets live
 * under `os.tmpdir()`, not here - see the socket-path fix), but its
 * metadata - the only way `auto status`/`send`/etc. can find it - was gone
 * until manually reconstructed. Only remove metadata for sessions whose own
 * recorded `pid` is no longer running; never touch a live one, no matter
 * whose test (or human) started it.
 */
function cleanAutoDir() {
  if (!existsSync(autoDir)) return;
  for (const entry of readdirSync(autoDir)) {
    if (!entry.endsWith(".json")) continue;
    const metaPath = join(autoDir, entry);
    let pid: number | undefined;
    try {
      pid = (JSON.parse(readFileSync(metaPath, "utf-8")) as { pid?: number }).pid;
    } catch {
      // Unreadable/corrupt metadata - safe to remove, nothing can be using it.
      rmSync(metaPath, { force: true });
      continue;
    }
    const alive = typeof pid === "number" && isPidAlive(pid);
    if (!alive) {
      rmSync(metaPath, { force: true });
      rmSync(metaPath.replace(/\.json$/, ".log"), { force: true });
    }
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// No global beforeEach/afterEach cleanup: tests run in parallel workers
// sharing one .waygraph-auto/ directory, and a blanket wipe from one test's
// afterEach can delete another concurrently-running test's live session
// files. Each test below quits its own session(s) at the end instead - a
// real bug caught by the new --non-headless test running alongside the main
// sequence test for the first time.
test.beforeAll(() => cleanAutoDir());

/**
 * The CLI sets a non-zero exit code whenever a response is `{ok:false}`
 * (matching `validate`'s own convention), which makes `execFile` reject the
 * promise even though stdout still holds a well-formed JSON response. Both
 * outcomes are legitimate call results for these tests - only a truly empty
 * stdout is a real failure.
 */
async function runCli(args: string[], opts?: { cwd?: string }): Promise<string> {
  try {
    const { stdout } = (await exec(node, [CLI, ...args], opts)) as { stdout: string };
    return stdout;
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return stdout;
    throw err;
  }
}

async function detach(extraArgs: string[] = []): Promise<{
  sessionId: string;
  socketPath: string;
  headless: boolean;
}> {
  const stdout = await runCli(["auto", "--cli", "--detach", ...extraArgs, sauceRoot]);
  return JSON.parse(stdout.trim());
}

async function send(sessionId: string, pick: string): Promise<{ ok: boolean; [k: string]: unknown }> {
  const stdout = await runCli(["auto", "send", sessionId, pick], { cwd: sauceRoot });
  return JSON.parse(stdout.trim());
}

async function status(sessionId: string): Promise<{ ok: boolean; [k: string]: unknown }> {
  try {
    const stdout = await runCli(["auto", "status", sessionId], { cwd: sauceRoot });
    return JSON.parse(stdout.trim());
  } catch (err) {
    // An unknown / ended session is a plain stderr message with exit 1 (not JSON) - see commands/session.ts.
    const stderr = (err as { stderr?: string }).stderr;
    if (stderr) return { ok: false, error: stderr.trim() };
    throw err;
  }
}

async function dom(
  sessionId: string,
  args: string[] = [],
): Promise<{ ok: boolean; [k: string]: unknown }> {
  const stdout = await runCli(["auto", "dom", sessionId, ...args], { cwd: sauceRoot });
  return JSON.parse(stdout.trim());
}

async function trace(sessionId: string): Promise<{ ok: boolean; [k: string]: unknown }> {
  const stdout = await runCli(["auto", "trace", sessionId], { cwd: sauceRoot });
  return JSON.parse(stdout.trim());
}

async function reach(sessionId: string, checkpoint: string): Promise<{ ok: boolean; [k: string]: unknown }> {
  const stdout = await runCli(["auto", "reach", sessionId, checkpoint], { cwd: sauceRoot });
  return JSON.parse(stdout.trim());
}

async function highlight(
  sessionId: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; painted?: number; missing?: string[]; [k: string]: unknown }> {
  const stdout = await runCli(["auto", "highlight", sessionId, JSON.stringify(body)], {
    cwd: sauceRoot,
  });
  return JSON.parse(stdout.trim());
}

test("--detach requires --cli", async () => {
  await expect(exec(node, [CLI, "auto", "--detach", sauceRoot])).rejects.toMatchObject({
    stderr: expect.stringContaining("--detach requires --cli"),
  });
});

test("status/send report a clear error for an unknown session, not a hang", async () => {
  const res = await status("no-such-session");
  expect(res.ok).toBe(false);
  expect(String(res.error)).toMatch(/no such session/);
});

test("--detach defaults to headless; --non-headless launches a real visible browser", async () => {
  test.setTimeout(60_000);

  const headlessSession = await detach();
  expect(headlessSession.headless).toBe(true);
  await send(headlessSession.sessionId, "q");

  const headfulSession = await detach(["--non-headless"]);
  expect(headfulSession.headless).toBe(false);
  await send(headfulSession.sessionId, "q");
});

test("full non-interactive sequence: detach, drive login + add-to-cart, status, quit", async () => {
  test.setTimeout(180_000);

  const { sessionId, socketPath } = await detach();
  expect(sessionId).toMatch(/^[0-9a-f]{8}$/);
  expect(existsSync(socketPath)).toBe(true);

  // Initial status: on the login page, the three atomic login Blocks are
  // the available moves (proves the session/session-control layer and the
  // atomicity refactor compose correctly).
  const initial = await status(sessionId);
  expect(initial.ok).toBe(true);
  const initialSnapshot = initial.snapshot as { here: string; sections: { edges: { block: string }[] }[] };
  expect(initialSnapshot.here).toBe("LoginPage");
  const initialBlocks = initialSnapshot.sections.flatMap((s) => s.edges.map((e) => e.block));
  expect(initialBlocks).toEqual(
    expect.arrayContaining(["fill-username", "fill-password", "submit-login"]),
  );

  // An invalid pick is rejected without advancing the session.
  const invalid = await send(sessionId, "999");
  expect(invalid.ok).toBe(false);

  // dom: default aria mode returns a small, structured, non-empty snapshot
  // of the real login form.
  const domAriaDefault = await dom(sessionId);
  expect(domAriaDefault.ok).toBe(true);
  const ariaSnapshot = domAriaDefault.snapshot as { mode: string; truncated: boolean; tree: unknown };
  expect(ariaSnapshot.mode).toBe("aria");
  expect(ariaSnapshot.truncated).toBe(false);
  expect(JSON.stringify(ariaSnapshot.tree)).toMatch(/Username|Password|Login/);

  // dom --selector scopes to one element's subtree - strictly smaller than
  // the whole-page snapshot above.
  const domScoped = await dom(sessionId, ["--selector", "#login-button"]);
  expect(domScoped.ok).toBe(true);
  const scopedSnapshot = domScoped.snapshot as { selector: string; tree: unknown };
  expect(scopedSnapshot.selector).toBe("#login-button");
  expect(JSON.stringify(scopedSnapshot.tree).length).toBeLessThan(
    JSON.stringify(ariaSnapshot.tree).length,
  );

  // dom --selector on a selector matching nothing fails clearly.
  const domMissing = await dom(sessionId, ["--selector", "#does-not-exist"]);
  expect(domMissing.ok).toBe(false);
  expect(String(domMissing.error)).toMatch(/no element matches selector/);

  // dom --mode full returns a raw DOM subtree (tag/attrs), distinct from aria.
  const domFull = await dom(sessionId, ["--mode", "full"]);
  expect(domFull.ok).toBe(true);
  const fullSnapshot = domFull.snapshot as { mode: string; tree: { tag: string } };
  expect(fullSnapshot.mode).toBe("full");
  expect(fullSnapshot.tree.tag).toBe("html");

  // Drive the atomic login sequence by block name -> menu index each turn
  // (indices can shift; resolve by name to keep this test robust to menu
  // ordering rather than hard-coding positions).
  async function pickByBlockName(name: string) {
    const st = await status(sessionId);
    const snap = st.snapshot as { sections: { edges: { index: number; block: string }[] }[] };
    const edge = snap.sections.flatMap((s) => s.edges).find((e) => e.block === name);
    if (!edge) throw new Error(`"${name}" not found on current menu`);
    return send(sessionId, String(edge.index));
  }

  const afterUser = await pickByBlockName("fill-username");
  expect(afterUser.ok).toBe(true);

  const afterPass = await pickByBlockName("fill-password");
  expect(afterPass.ok).toBe(true);

  const afterSubmit = await pickByBlockName("submit-login");
  expect(afterSubmit.ok).toBe(true);
  expect((afterSubmit.snapshot as { here: string }).here).toBe("LoggedIn");

  // trace: a Checkpoint/Block-level record of the login sequence, in order,
  // not raw clicks - and fill-username/submit-login carry their authored
  // stubBefore/stubAfter fixtures since those Blocks author them.
  const traceRes = await trace(sessionId);
  expect(traceRes.ok).toBe(true);
  const steps = traceRes.trace as { block: string; from: string | null; to?: string; stubBefore?: unknown }[];
  expect(steps.map((s) => s.block)).toEqual(["fill-username", "fill-password", "submit-login"]);
  expect(steps[0]!.from).toBe("LoginPage");
  expect(steps[2]!.to).toBe("LoggedIn");
  expect(steps[0]!.stubBefore).toBeDefined();
  // The invalid pick from earlier never ran a Block, so it added no step.
  expect(steps.length).toBe(3);

  const afterAdd = await pickByBlockName("add-to-cart");
  expect(afterAdd.ok).toBe(true);
  expect((afterAdd.snapshot as { here: string }).here).toBe("ItemInCart");

  // dom --mode full on the real inventory page (much larger DOM than the
  // login form) actually hits the node/depth caps and reports truncated.
  const domFullInventory = await dom(sessionId, ["--mode", "full"]);
  expect(domFullInventory.ok).toBe(true);
  expect((domFullInventory.snapshot as { truncated: boolean }).truncated).toBe(true);

  // status is a pure getter - two calls in a row return identical state.
  const s1 = await status(sessionId);
  const s2 = await status(sessionId);
  expect(s1).toEqual(s2);

  // Quit ends the session and cleans up its identity.
  const quitRes = await send(sessionId, "q");
  expect(quitRes.ok).toBe(true);
  expect(quitRes.quit).toBe(true);

  await expect
    .poll(() => existsSync(socketPath), { timeout: 5_000 })
    .toBe(false);

  const afterQuit = await status(sessionId);
  expect(afterQuit.ok).toBe(false);
  expect(String(afterQuit.error)).toMatch(/no such session/);
});

test("auto highlight: paints agent fixture rings on the live login page", async () => {
  test.setTimeout(45_000);
  const { sessionId } = await detach();
  try {
    // Session lands on saucedemo login - real #user-name / #password.
    const painted = await highlight(sessionId, {
      rings: [
        { selector: "#user-name", label: "Username", tone: "planned" },
        { selector: "#password", label: "Password", tone: "info" },
      ],
      todos: ["Fill username", "Fill password", "Submit"],
      todoIndex: 0,
      holdMs: 0,
    });
    expect(painted.ok).toBe(true);
    expect(painted.painted).toBe(2);
    expect(painted.missing ?? []).toEqual([]);

    const missing = await highlight(sessionId, {
      rings: [{ selector: "#no-such-element-waygraph", label: "Gone", tone: "danger" }],
      holdMs: 0,
    });
    expect(missing.ok).toBe(true);
    expect(missing.painted).toBe(0);
    expect(missing.missing).toEqual(["#no-such-element-waygraph"]);

    const cleared = await highlight(sessionId, { clear: true });
    expect(cleared.ok).toBe(true);
    expect(cleared.painted).toBe(0);

    // Zoom + focus (demo-parity fixtures) - scroll/badge/veil, not CSS page scale.
    const zoomed = await highlight(sessionId, {
      rings: [
        {
          selector: "#login-button",
          label: "Login",
          tone: "success",
          focus: true,
          zoom: 1.5,
          detail: "submit",
        },
      ],
      holdMs: 0,
    });
    expect(zoomed.ok).toBe(true);
    expect(zoomed.painted).toBe(1);
    expect(zoomed.missing ?? []).toEqual([]);
  } finally {
    await send(sessionId, "q");
  }
});

test("auto reach: runs a real multi-step route to a Checkpoint in one call, against an already-running session", async () => {
  test.setTimeout(60_000);

  const { sessionId } = await detach();
  // Real login by hand first (fill/fill/submit - reach doesn't invent
  // same-Checkpoint setup steps; see openspec/changes/waygraph-pilot/design.md).
  const atLogin = await status(sessionId);
  const flat = (atLogin.snapshot as { sections: { edges: { block: string; index: number }[] }[] }).sections.flatMap((s) => s.edges);
  await send(sessionId, String(flat.find((e) => e.block === "fill-username")!.index));
  await send(sessionId, String(flat.find((e) => e.block === "fill-password")!.index));
  const loginRes = await send(sessionId, String(flat.find((e) => e.block === "submit-login")!.index));
  expect(loginRes.ok).toBe(true);

  // One real CLI call reaches CartPage from LoggedIn via the live "nav-cart"
  // wildcard edge - not a hand-picked index, the actual proof this exists for.
  const reachRes = await reach(sessionId, "CartPage");
  expect(reachRes.ok).toBe(true);
  expect(reachRes.path).toEqual(["nav-cart"]);
  expect((reachRes.snapshot as { here: string }).here).toBe("CartPage");

  await send(sessionId, "q");
});

test("a session against a deeply nested project path still starts - session sockets don't live under the project dir", async () => {
  test.setTimeout(30_000);

  // Real bug this reproduces: session sockets used to live at
  // <projectDir>/.waygraph-auto/<id>.sock. A long enough projectDir (a
  // realistic case: a package loaded through a consumer's own
  // node_modules/<pkg> path - see openspec/changes/waygraph-map) pushed that
  // absolute path past the OS's AF_UNIX socket path limit (~108 bytes on
  // Linux), failing with `listen EINVAL`. Construct a deliberately long,
  // deeply nested (but otherwise empty - AutoSession tolerates zero Blocks)
  // project directory to prove the fix, not just assert it.
  const segment = "a-deliberately-long-directory-name-to-exceed-the-socket-path-limit";
  const baseDir = join(tmpdir(), `wg-deep-${Date.now()}`);
  const deepDir = join(baseDir, segment, segment);
  mkdirSync(deepDir, { recursive: true });
  expect(join(deepDir, ".waygraph-auto", "aaaaaaaa.sock").length).toBeGreaterThan(108);

  let sessionId: string | undefined;
  try {
    const stdout = await runCli(["auto", "--cli", "--detach"], { cwd: deepDir });
    const meta = JSON.parse(stdout.trim()) as { sessionId: string; socketPath: string };
    sessionId = meta.sessionId;
    // The fix: the socket is short and NOT under the (long) project directory.
    expect(meta.socketPath.startsWith(deepDir)).toBe(false);
    expect(meta.socketPath.length).toBeLessThan(108);

    const statusRes = await runCli(["auto", "status", meta.sessionId], { cwd: deepDir });
    const status = JSON.parse(statusRes.trim());
    expect(status.ok).toBe(true);
    expect(status.snapshot.here).toBeNull(); // zero Blocks in this throwaway dir
  } finally {
    if (sessionId) await runCli(["auto", "send", sessionId, "q"], { cwd: deepDir }).catch(() => {});
    rmSync(baseDir, { recursive: true, force: true });
  }
});
