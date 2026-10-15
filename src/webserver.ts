// Starts/stops a project's own playwright.config `webServer` around `waygraph run`/`demo`/`auto`,
// the same block `waygraph test` already honors.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

/** The subset of Playwright's `TestConfigWebServer` this drives - same field names. */
export interface WebServerConfig {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  port?: number;
  url?: string;
  reuseExistingServer?: boolean;
  timeout?: number;
  stdout?: "pipe" | "ignore";
  stderr?: "pipe" | "ignore";
}

const CONFIG_FILES = [
  "playwright.config.ts",
  "playwright.config.mts",
  "playwright.config.mjs",
  "playwright.config.js",
  "playwright.config.cjs",
];

async function loadWebServerConfigs(projectDir: string): Promise<WebServerConfig[]> {
  for (const name of CONFIG_FILES) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    let mod: { default?: { webServer?: WebServerConfig | WebServerConfig[] } };
    try {
      mod = (await import(pathToFileURL(p).href)) as typeof mod;
    } catch (err) {
      throw new Error(`waygraph: failed to load ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const webServer = mod.default?.webServer;
    if (!webServer) return [];
    return Array.isArray(webServer) ? webServer : [webServer];
  }
  return [];
}

async function isUp(target: string): Promise<boolean> {
  try {
    return (await fetch(target)).status < 500;
  } catch {
    return false;
  }
}

async function waitUntilUp(target: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp(target)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`waygraph: webServer "${target}" not ready after ${timeoutMs}ms`);
}

async function startWebServers(configs: WebServerConfig[], projectDir: string): Promise<ChildProcess[]> {
  const started: ChildProcess[] = [];
  for (const cfg of configs) {
    const target = cfg.url ?? (cfg.port ? `http://localhost:${cfg.port}` : undefined);
    if (!target) throw new Error(`waygraph: webServer needs "url" or "port"`);
    if (cfg.reuseExistingServer !== false && (await isUp(target))) continue;
    // detached = own process group, so stop() kills the shell AND whatever it exec'd.
    const child = spawn(cfg.command, {
      shell: true,
      detached: true,
      cwd: cfg.cwd ? join(projectDir, cfg.cwd) : projectDir,
      env: { ...process.env, ...cfg.env },
      stdio: ["ignore", cfg.stdout === "pipe" ? "inherit" : "ignore", cfg.stderr === "ignore" ? "ignore" : "inherit"],
    });
    started.push(child);
    await waitUntilUp(target, cfg.timeout ?? 60_000);
  }
  return started;
}

function stopWebServers(started: ChildProcess[]): void {
  for (const child of started) {
    try {
      if (typeof child.pid === "number") process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already exited */
    }
  }
}

/** Runs `fn` with the project's `webServer` (if any) up; only servers this call started get stopped. */
export async function withWebServer<T>(projectDir: string, fn: () => Promise<T>): Promise<T> {
  const started = await startWebServers(await loadWebServerConfigs(projectDir), projectDir);
  try {
    return await fn();
  } finally {
    stopWebServers(started);
  }
}
