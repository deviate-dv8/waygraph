import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Proof for openspec/changes/waygraph-blind-pilot: raw interaction
 * primitives (click/type/goto) and live library reload, against a real
 * detached session on a project that starts with ZERO .block.ts files - the
 * cold-start case non-blind Pilot (waygraph-pilot) doesn't cover.
 *
 * dist/cli.js directly, not bin/waygraph: none of the ops this file drives
 * (send/status/click/type/goto/reload) import .block.ts files in the OUTER
 * CLI process - they only write to the session's own socket. All real Block
 * loading/reloading happens in the already-spawned CHILD process, which
 * `spawnDetachedSession` always routes through bin/waygraph internally
 * regardless of how the outer command was invoked (the same reason
 * tests/cli/auto-session.spec.ts already uses dist/cli.js directly).
 *
 * Each test gets its own throwaway project directory (a fresh
 * mkdtempSync copy of the tracked pages/ + package.json), not the shared
 * tests/fixtures/blind-pilot-site/ directly. Real bug found and fixed while
 * writing these: playwright.config.ts sets fullyParallel: true, so even one
 * test's own repeated runs (--repeat-each) can execute concurrently in
 * different workers - a single shared mutable project directory (one test
 * writing a Block file while another reads "zero Blocks") raced exactly the
 * way concurrent runs of the SAME test would. Per-test isolation (not just
 * per-different-test scoping) is the actual fix; only the static pages/
 * content and the HTTP server serving it are safely shared.
 */

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const staticFixtureRoot = join(import.meta.dirname, "../fixtures/blind-pilot-site");
const pagesDir = join(staticFixtureRoot, "pages");
const repoRoot = join(import.meta.dirname, "../..");

/** A fresh, isolated copy of the static fixture project - safe for one test to mutate (write a .block.ts file, run --detach) without any other concurrent test/run seeing it. */
function createIsolatedProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "waygraph-blind-pilot-"));
  cpSync(join(staticFixtureRoot, "package.json"), join(dir, "package.json"));
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  symlinkSync(repoRoot, join(dir, "node_modules", "waygraph"), "dir");
  return dir;
}

let server: Server;
let origin: string;

test.beforeAll(async () => {
  // Serves the one tracked, never-mutated pages/ directory - shared safely
  // across every worker/test, unlike each test's own project directory.
  server = createServer((req, res) => {
    const path = (req.url === "/" ? "/index.html" : req.url ?? "/index.html").replace(/^\//, "");
    try {
      const content = readFileSync(join(pagesDir, path));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fixture server failed to bind");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
});

async function runCli(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = (await exec(node, [CLI, ...args], { cwd })) as { stdout: string };
    return stdout;
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return stdout;
    throw err;
  }
}

async function detach(projectDir: string): Promise<{ sessionId: string; socketPath: string; headless: boolean }> {
  const stdout = await runCli(["auto", "--cli", "--detach", "--base-url", origin, projectDir], projectDir);
  return JSON.parse(stdout.trim());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function auto(projectDir: string, sub: string, sessionId: string, ...args: string[]): Promise<any> {
  const stdout = await runCli(["auto", sub, sessionId, ...args], projectDir);
  return JSON.parse(stdout.trim());
}

test("a detached session starts against a project with zero Blocks - here is null, no crash", async () => {
  test.setTimeout(30_000);
  const projectDir = createIsolatedProjectDir();
  const { sessionId } = await detach(projectDir);
  try {
    const status = await auto(projectDir, "status", sessionId);
    expect(status.ok).toBe(true);
    expect(status.snapshot.here).toBeNull();
    expect(status.snapshot.sections).toEqual([]);
  } finally {
    await auto(projectDir, "send", sessionId, "q");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("click acts on a real element with zero Blocks, and the resulting snapshot has here: null", async () => {
  test.setTimeout(30_000);
  const projectDir = createIsolatedProjectDir();
  const { sessionId } = await detach(projectDir);
  try {
    const res = await auto(projectDir, "click", sessionId, "#mark-btn");
    expect(res.ok).toBe(true);
    expect(res.snapshot.here).toBeNull();

    const marker = await auto(projectDir, "dom", sessionId, "--mode", "full", "--selector", "#marker");
    expect(marker.ok).toBe(true);
    expect(JSON.stringify(marker.snapshot.tree)).toContain("clicked");
  } finally {
    await auto(projectDir, "send", sessionId, "q");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("type fills a real input with zero Blocks", async () => {
  test.setTimeout(30_000);
  const projectDir = createIsolatedProjectDir();
  const { sessionId } = await detach(projectDir);
  try {
    const res = await auto(projectDir, "type", sessionId, "#name-input", "hello world");
    expect(res.ok).toBe(true);

    const echo = await auto(projectDir, "dom", sessionId, "--mode", "full", "--selector", "#echo");
    expect(echo.ok).toBe(true);
    expect(JSON.stringify(echo.snapshot.tree)).toContain("hello world");
  } finally {
    await auto(projectDir, "send", sessionId, "q");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("goto navigates the real live page", async () => {
  test.setTimeout(30_000);
  const projectDir = createIsolatedProjectDir();
  const { sessionId } = await detach(projectDir);
  try {
    const res = await auto(projectDir, "goto", sessionId, `${origin}/second.html`);
    expect(res.ok).toBe(true);

    const heading = await auto(projectDir, "dom", sessionId, "--mode", "full", "--selector", "#second-heading");
    expect(heading.ok).toBe(true);
    expect(JSON.stringify(heading.snapshot.tree)).toContain("Second Page");
  } finally {
    await auto(projectDir, "send", sessionId, "q");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("click/type fail loud, naming the selector, when nothing matches", async () => {
  test.setTimeout(30_000);
  const projectDir = createIsolatedProjectDir();
  const { sessionId } = await detach(projectDir);
  try {
    const clickRes = await auto(projectDir, "click", sessionId, "#does-not-exist");
    expect(clickRes.ok).toBe(false);
    expect(String(clickRes.error)).toContain("#does-not-exist");

    const typeRes = await auto(projectDir, "type", sessionId, "#also-missing", "x");
    expect(typeRes.ok).toBe(false);
    expect(String(typeRes.error)).toContain("#also-missing");
  } finally {
    await auto(projectDir, "send", sessionId, "q");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("cold-start end to end: explore with zero Blocks, author one to disk, reload, then drive it for real", async () => {
  test.setTimeout(45_000);
  const projectDir = createIsolatedProjectDir();
  const { sessionId } = await detach(projectDir);
  try {
    // 1. Cold: no Blocks exist yet.
    const before = await auto(projectDir, "status", sessionId);
    expect(before.snapshot.here).toBeNull();
    expect(before.snapshot.sections).toEqual([]);

    // 2. Explore blind: DOM inspection + raw navigation, no Block's help.
    const dom = await auto(projectDir, "dom", sessionId, "--mode", "full", "--selector", "#go-second");
    expect(dom.ok).toBe(true);
    expect(JSON.stringify(dom.snapshot.tree)).toContain("Go to second page");

    // 3. Author a real Block to disk mid-session - standing in for what a
    //    driving agent would write, not code this package generates (see
    //    spec.md's own requirement that this capability generates no Block
    //    content).
    const blocksDir = join(projectDir, "blocks");
    mkdirSync(blocksDir, { recursive: true });
    writeFileSync(
      join(blocksDir, "nav-second-page.block.ts"),
      [
        'import { defineNavBlock, Trait } from "waygraph";',
        "",
        "export const NavSecondPageBlock = defineNavBlock({",
        '  name: "nav-second-page",',
        '  description: "Goes to the fixture\'s second page.",',
        '  checkpoint: "SecondPage",',
        '  url: "/second.html",',
        '  verify: [Trait.url({ pathname: "/second.html" })],',
        "});",
        "",
      ].join("\n"),
    );

    // 4. Not visible yet - the session's library was loaded before this file existed.
    const stillBlind = await auto(projectDir, "status", sessionId);
    expect(stillBlind.snapshot.sections).toEqual([]);

    // 5. Reload picks it up, without restarting the session.
    const reloaded = await auto(projectDir, "reload", sessionId);
    expect(reloaded.ok).toBe(true);
    const afterReload = await auto(projectDir, "status", sessionId);
    const navEdge = afterReload.snapshot.sections
      .flatMap((s: { edges: any[] }) => s.edges)
      .find((e: { block: string }) => e.block === "nav-second-page");
    expect(navEdge).toBeTruthy();
    expect(navEdge.kind).toBe("nav");
    expect(navEdge.to).toBe("SecondPage");

    // 6. Genuinely driveable, not just visible: running it reaches the real Checkpoint.
    const ran = await auto(projectDir, "send", sessionId, String(navEdge.index));
    expect(ran.ok).toBe(true);
    expect(ran.snapshot.here).toBe("SecondPage");
  } finally {
    await auto(projectDir, "send", sessionId, "q");
    rmSync(projectDir, { recursive: true, force: true });
  }
});
