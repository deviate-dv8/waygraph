import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

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

function cleanAutoDir() {
  rmSync(autoDir, { recursive: true, force: true });
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
  const stdout = await runCli(["auto", "status", sessionId], { cwd: sauceRoot });
  return JSON.parse(stdout.trim());
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
