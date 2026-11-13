import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";

// `waygraph studio` from inside a project's folder: it finds the project, serves its map, and Ctrl-C stops it.
const root = join(import.meta.dirname, "..", "..");
const PORT = 3477;

function waitForLine(child: ChildProcess, pattern: RegExp): Promise<string> {
  return new Promise((res, rej) => {
    let out = "";
    const timer = setTimeout(() => rej(new Error(`no ${pattern} in:\n${out}`)), 30_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const match = out.match(pattern);
      if (match) {
        clearTimeout(timer);
        res(match[0]);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => (out += chunk.toString()));
  });
}

test("waygraph studio finds the project it's run in and serves its map", async ({ page }) => {
  test.setTimeout(90_000);
  // Its own process group, as a terminal would start it: Ctrl-C reaches every process in it.
  const ui = spawn(process.execPath, [join(root, "bin", "waygraph"), "studio", "--port", String(PORT)], {
    cwd: join(root, "examples", "saucedemo", "src"),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    expect(await waitForLine(ui, /waygraph studio: .*saucedemo/)).toContain(join("examples", "saucedemo"));
    await expect(async () => {
      await page.goto(`http://localhost:${PORT}/`);
      await expect(page.locator(".vue-flow__node").first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.locator(".vue-flow__node", { hasText: "LoginPage" })).toBeVisible();
    await page.getByRole("link", { name: "Flows" }).click();
    await expect(page.getByText("loginFlow").first()).toBeVisible();
  } finally {
    const exited = new Promise<number | null>((res) => ui.on("exit", (code) => res(code)));
    if (ui.pid) process.kill(-ui.pid, "SIGINT");
    await exited;
  }
});

test("a stop sent to waygraph alone (kill <pid>) stops the UI's server too", async () => {
  test.setTimeout(90_000);
  const port = PORT + 1;
  const ui = spawn(process.execPath, [join(root, "bin", "waygraph"), "studio", join(root, "examples", "saucedemo"), "--port", String(port)], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForLine(ui, /http:\/\/localhost:\d+/);
    await expect.poll(async () => (await fetch(`http://localhost:${port}/`).catch(() => null))?.status ?? 0, { timeout: 30_000 }).toBe(200);
    const exited = new Promise<void>((res) => ui.on("exit", () => res()));
    ui.kill("SIGTERM");
    await exited;
    // Nothing answers on its port any more: the server went with it.
    await expect.poll(async () => (await fetch(`http://localhost:${port}/`).catch(() => null)) === null, { timeout: 10_000 }).toBe(true);
  } finally {
    if (ui.pid) {
      try {
        process.kill(-ui.pid, "SIGINT");
      } catch {
        // Already gone.
      }
    }
  }
});

test("the API console sends a request from Waygraph Studio and shows the answer in words", async ({ page }) => {
  test.setTimeout(90_000);
  const target = createServer((_req, res) => void res.writeHead(201, { "content-type": "application/json" }).end('{"id":7}'));
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  const ui = spawn(process.execPath, [join(root, "bin", "waygraph"), "studio", "--port", String(PORT + 2)], {
    cwd: join(root, "examples", "saucedemo", "src"),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForLine(ui, /waygraph studio: .*saucedemo/);
    await expect(async () => {
      await page.goto(`http://localhost:${PORT + 2}/api`);
      await expect(page.getByRole("heading", { name: "API" })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await page.getByPlaceholder("https://…").fill(`http://127.0.0.1:${(target.address() as { port: number }).port}/posts`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("201 Created")).toBeVisible();
    await expect(page.getByText('"id": 7')).toBeVisible();
  } finally {
    target.close();
    const exited = new Promise<number | null>((res) => ui.on("exit", (code) => res(code)));
    if (ui.pid) process.kill(-ui.pid, "SIGINT");
    await exited;
  }
});
