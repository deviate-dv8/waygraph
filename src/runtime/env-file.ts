// A project's .env files, read the way Vite and Next read them (Node's own parser: the dotenv format).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { envString, setEnv } from "../engine/env.js";
import { takeGlobalFlag } from "./global-flag.js";

/** The env mode: `--env <mode>` / `WAYGRAPH_ENV`, else `NODE_ENV`, else "development". */
export function envMode(): string {
  return envString("WAYGRAPH_ENV") || process.env.NODE_ENV || "development";
}

/** Removes `--env <mode>` / `--env=<mode>` from argv and records it as `WAYGRAPH_ENV`, so it never reaches a forwarded command. */
export function takeEnvFlag(argv: string[]): string[] {
  const { value, rest } = takeGlobalFlag(argv, "env");
  if (value !== undefined) setEnv("WAYGRAPH_ENV", value);
  return rest;
}

/**
 * Loads `.env` / `.env.local` / `.env.<mode>` / `.env.<mode>.local` from a project's root, the layering
 * Vite and Next use: each later file overrides the earlier ones (`.env.<mode>.local` wins). A value the
 * shell already exported always beats every file, so a file only fills gaps. Calling it twice is harmless.
 */
export function loadEnvFiles(projectDir: string, mode: string = envMode()): void {
  const merged: Record<string, string> = {};
  for (const name of [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`]) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    try {
      Object.assign(merged, parseEnv(readFileSync(p, "utf-8")));
    } catch {
      continue; // unreadable file - never fail a run over an optional .env
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
