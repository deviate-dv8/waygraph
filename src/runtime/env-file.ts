// Native .env support - no `dotenv` dependency (same "bring nothing, read what's already there"
// philosophy as mem-stub.ts's own Faker note: this is a ~20-line parser, not a new runtime dep).
// Real, direct user ask: FE consumers keep their own .env and had to hack around waygraph not
// reading it (manually re-exporting values, duplicating them into package.json's "waygraph"
// field) to get waygraph to see the same config their actual app already uses.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { envString, setEnv } from "../engine/env.js";
import { takeGlobalFlag } from "./global-flag.js";

/** `KEY=value` lines only - no `${VAR}` expansion, no multiline values. Matches the common
 * Vite/Next `.env` shape, not full dotenv-expand parity. */
function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;
    let value = withoutExport.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

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
      Object.assign(merged, parseEnvFile(readFileSync(p, "utf-8")));
    } catch {
      continue; // unreadable file - never fail a run over an optional .env
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
