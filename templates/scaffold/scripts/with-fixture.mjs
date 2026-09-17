#!/usr/bin/env node
/**
 * Start fixture-server, run a child command, tear down on exit.
 * Usage: node scripts/with-fixture.mjs [--] <cmd> [args...]
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.WAYGRAPH_FIXTURE_PORT || "4177";
const HOST = process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1";

const argv = process.argv.slice(2).filter((a) => a !== "--");
if (argv.length === 0) {
  console.error("usage: node scripts/with-fixture.mjs <cmd> [args...]");
  process.exit(1);
}

const env = {
  ...process.env,
  WAYGRAPH_FIXTURE_PORT: PORT,
  WAYGRAPH_FIXTURE_HOST: HOST,
  WAYGRAPH_FIXTURE_QUIET: "1",
  WAYGRAPH_BASE_URL: process.env.WAYGRAPH_BASE_URL || `http://${HOST}:${PORT}`,
};

const server = spawn(process.execPath, [join(HERE, "fixture-server.mjs")], {
  env,
  stdio: ["ignore", "ignore", "inherit"],
});

function killServer() {
  try {
    server.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

async function waitReady(ms = 5000) {
  const url = `http://${HOST}:${PORT}/home.html`;
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`fixture server not ready at ${url}`);
}

let code = 1;
try {
  await waitReady();
  const child = spawn(argv[0], argv.slice(1), { env, stdio: "inherit", shell: false });
  code = await new Promise((resolve) => {
    child.on("exit", (c, signal) => resolve(signal ? 1 : (c ?? 1)));
  });
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  code = 1;
} finally {
  killServer();
}
process.exit(code);
