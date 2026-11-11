import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { helpLines, parseCommand } from "../args.js";
import { packageRoot } from "../util.js";
import { findProjectDir } from "../../runtime/waygraph-config.js";
import { setEnv } from "../../engine/env.js";

const OPTIONS = {
  port: { type: "string", value: "N", help: "Serve on this port (default 9294, or the next free one)" },
  help: { type: "boolean", help: "This help" },
} as const;

/** The port Waygraph Studio asks for first: "WAYG" on a phone keypad, and no common dev server's. */
const DEFAULT_PORT = 9294;

/**
 * `waygraph studio [project] [--port N]`: Waygraph Studio on a project - its map, flows and runs, and playing a flow - at
 * http://localhost:<port>. The project is the folder given, or the one the current folder is in. Ctrl-C stops it.
 */
export async function studioCase(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand("studio", OPTIONS, args.slice(1));
  if (values.help) {
    console.log(`waygraph studio [project] - the project's map, flows and runs in the browser, and playing a flow.

${helpLines(OPTIONS)}`);
    return;
  }
  const from = resolve(positionals[0] ?? process.cwd());
  const projectDir = findProjectDir(from);
  if (!projectDir) {
    console.error(`waygraph studio: no waygraph project at ${from} or above (looked for waygraph.config.* or a package.json depending on waygraph)`);
    process.exit(1);
  }
  const server = join(packageRoot(), "dist", "studio", "bin", "server.js");
  if (!existsSync(server)) {
    console.error(`waygraph studio: this install has no built UI (${server}); in a waygraph checkout, run npm run build`);
    process.exit(1);
  }
  const wanted = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(wanted) || wanted < 0 || wanted > 65535) {
    console.error(`waygraph studio: --port wants a port number, got "${values.port}"`);
    process.exit(1);
  }
  const port = values.port === undefined ? await freePortFrom(DEFAULT_PORT) : wanted;
  if (port === null) {
    console.error(`waygraph studio: no free port from ${DEFAULT_PORT} to ${DEFAULT_PORT + 99}; pick one with --port`);
    process.exit(1);
  }
  setEnv("WAYGRAPH_PROJECT_DIR", projectDir);

  const child = spawn(process.execPath, [server], {
    cwd: join(packageRoot(), "dist", "studio"),
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "localhost",
      PORT: String(port),
      LOG_LEVEL: "warn",
      SESSION_DRIVER: "cookie",
      // Signs this server's session cookies; a new one each start is enough for a local tool.
      APP_KEY: randomBytes(32).toString("base64url"),
      APP_URL: `http://localhost:${port}`,
    },
  });
  console.log(`waygraph studio: ${projectDir}\n  http://localhost:${port}   (Ctrl-C stops it)`);
  // Ctrl-C reaches the server too (same terminal); it stops a flow it's playing before it exits.
  const stop = () => child.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const code = await new Promise<number>((res) => child.on("exit", (c) => res(c ?? 0)));
  process.exit(code);
}

/** `from`, or the next port after it nobody is listening on. */
async function freePortFrom(from: number): Promise<number | null> {
  for (let port = from; port < from + 100; port++) {
    if (await isFree(port)) return port;
  }
  return null;
}

function isFree(port: number): Promise<boolean> {
  return new Promise((res) => {
    const probe = createServer();
    probe.once("error", () => res(false));
    probe.listen(port, "localhost", () => probe.close(() => res(true)));
  });
}
