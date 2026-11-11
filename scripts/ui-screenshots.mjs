#!/usr/bin/env node
// The Waygraph UI guide's screenshots (docs/public/ui/*.jpg), taken from this checkout's build over a copy of
// examples/saucedemo with a short, clean run history: a checkout that passes (recorded), and a chain that fails on a
// layout's check, so the run page shows a readable failure. Needs network (saucedemo.com) and `npm run build` first.
// Run: npm run docs:ui-shots. Leaves no server or browser running.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs", "public", "ui");
const PORT = 9399;
const BASE = `http://localhost:${PORT}`;
const CLI = join(root, "bin", "waygraph");

// A copy of the example, linked to this checkout, with no runs of its own.
const work = mkdtempSync(join(tmpdir(), "waygraph-ui-shots-"));
const project = join(work, "saucedemo");
cpSync(join(root, "examples", "saucedemo"), project, {
  recursive: true,
  filter: (src) => !/[\\/](\.waygraph|node_modules|test-results)([\\/]|$)/.test(src.slice(root.length)),
});
mkdirSync(join(project, "node_modules"), { recursive: true });
symlinkSync(root, join(project, "node_modules", "waygraph"), "dir");

const env = { ...process.env, WAYGRAPH_HEADED: "0" };
const play = (...args) => spawnSync(process.execPath, [CLI, "run", ...args], { cwd: project, env, stdio: "inherit" });
// Fails on purpose: the menu isn't on the login page, and the run says so before clicking. First, so the flows' newest
// runs are the ones that pass.
play("loginFlow then menu-logout then menu-logout", "--mem-stub");
play("loginFlow", "--mem-stub");
play("loginFlow then catalogLogoutFlow", "--mem-stub");
play("checkoutFlow", "--video");

const server = spawn(process.execPath, [CLI, "ui", project, "--port", String(PORT)], { env, detached: true, stdio: "ignore" });
const stop = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch (err) {
    if (err.code !== "ESRCH") throw err;
  }
};
process.on("exit", stop);

/** A page's Inertia props, from the JSON the server embeds in it. */
async function props(path) {
  const html = await (await fetch(BASE + path)).text();
  const json = /<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  return JSON.parse(json ?? "{}").props ?? {};
}

for (let i = 0; ; i++) {
  const ready = await fetch(BASE + "/").then((r) => r.ok, () => false);
  if (ready) break;
  if (i > 90) throw new Error("waygraph ui didn't start");
  await new Promise((r) => setTimeout(r, 1000));
}

const { runs = [] } = await props("/runs");
const failed = runs.find((r) => r.ok === false);
const passed = runs.find((r) => r.ok === true && r.flows.includes("checkoutFlow"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const shoot = async (name, path, { scheme = "light", before } = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  await page.goto(BASE + path, { waitUntil: "load" });
  // The map lays out, measures its boxes and fits them in view.
  await page.waitForTimeout(3000);
  if (before) {
    await before(page);
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: join(out, `${name}.jpg`), type: "jpeg", quality: 85 });
  await page.close();
  console.log(`docs/public/ui/${name}.jpg`);
};

try {
  await shoot("map", "/");
  await shoot("map-dark", "/", { scheme: "dark" });
  await shoot("map-page", "/", { before: (p) => p.locator(".vue-flow__node-page", { hasText: "InventoryPage" }).click() });
  await shoot("map-layout", "/", { before: (p) => p.locator(".vue-flow__node-layout").first().click() });
  await shoot("map-legend", "/", { before: (p) => p.getByRole("button", { name: "Legend" }).click() });
  await shoot("flows", "/flows");
  await shoot("flow", "/flows/checkoutFlow");
  await shoot("blocks", "/blocks");
  await shoot("runs", "/runs");
  if (passed) await shoot("run", `/runs/${passed.id}`);
  if (failed) await shoot("run-failed", `/runs/${failed.id}`);
  await shoot("project", "/project");
} finally {
  await browser.close();
  stop();
  rmSync(work, { recursive: true, force: true });
}
