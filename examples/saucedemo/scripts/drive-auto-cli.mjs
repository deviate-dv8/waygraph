#!/usr/bin/env node
/**
 * Drive `waygraph auto --cli` through login -> add-all -> remove-all -> quit.
 * Waits for each Choose: prompt so picks are not sent early.
 *
 * Usage (from examples/saucedemo):
 *   node scripts/drive-auto-cli.mjs
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const waygraphBin = join(root, "../../bin/waygraph");
const DATA =
  process.env.WAYGRAPH_DATA ??
  '{"saucedemo.credentials":{"username":"standard_user","password":"secret_sauce"}}';

function pickByLabel(menuText, label) {
  const re = new RegExp(`\\[(\\d+)\\]\\s+${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const m = menuText.match(re);
  if (!m) throw new Error(`menu missing "${label}"\n${menuText}`);
  return m[1];
}

async function main() {
  const child = spawn(waygraphBin, ["auto", "--cli", "--data", DATA, "."], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  let buf = "";
  const dump = (chunk, stream) => {
    const s = chunk.toString();
    buf += s;
    process[stream].write(s);
  };
  child.stdout.on("data", (c) => dump(c, "stdout"));
  child.stderr.on("data", (c) => dump(c, "stderr"));

  const waitChoose = () =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (buf.includes("Choose:")) {
          const i = buf.lastIndexOf("Choose:");
          const slice = buf.slice(Math.max(0, i - 4000), i + 8);
          resolve(slice);
          return;
        }
        if (Date.now() - start > 120_000) {
          reject(new Error(`timeout waiting for Choose:\n${buf.slice(-2000)}`));
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });

  const send = (line) => {
    console.error(`\n>> pick ${line.trim()}`);
    buf = buf.replace(/Choose:/g, "Choose(done):");
    child.stdin.write(line);
  };

  try {
    let menu = await waitChoose();
    send("1\n"); // submit-login
    menu = await waitChoose();
    if (!/LoggedIn|Add all to cart/.test(menu)) {
      throw new Error(`expected inventory after login, got:\n${menu}`);
    }
    send(`${pickByLabel(menu, "Add all to cart")}\n`);
    menu = await waitChoose();
    send(`${pickByLabel(menu, "Remove all from cart")}\n`);
    menu = await waitChoose();
    if (!/Add all to cart/.test(menu)) {
      throw new Error(`expected Add all again after remove-all, got:\n${menu}`);
    }
    send("q\n");
    const code = await new Promise((res) => child.on("exit", res));
    if (code !== 0 && code !== null) process.exitCode = code;
    else console.error("\ndrive-auto-cli: PASS login -> add-all -> remove-all -> quit");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    child.kill("SIGTERM");
    process.exitCode = 1;
  }
}

main();
