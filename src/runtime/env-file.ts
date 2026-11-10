// A project's .env files, read the way Vite and Next read them (Node's own parser: the dotenv format).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
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

/** A variable something in the project can read, to list in its .env files. */
export interface EnvVariable {
  name: string;
  /** One line on what it does. */
  about: string;
}

/**
 * Lists `variables` in the project's `.env.example` and `.env` (made when missing), under a `# header` line, each
 * commented out and blank (`# NAME=`) to fill in. A variable either file already names, set or commented, is left as it
 * is. Returns the files it wrote to.
 */
export function listEnvVariables(projectDir: string, header: string, variables: readonly EnvVariable[]): string[] {
  const written: string[] = [];
  for (const name of [".env.example", ".env"]) {
    const file = join(projectDir, name);
    const text = existsSync(file) ? readFileSync(file, "utf-8") : "";
    const named = (v: EnvVariable) => new RegExp(`^\\s*#?\\s*${v.name}\\s*=`, "m").test(text);
    const missing = variables.filter((v) => !named(v));
    if (!missing.length) continue;
    const block = [`# ${header}`, ...missing.flatMap((v) => [`# ${v.about}`, `# ${v.name}=`])].join("\n");
    appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}${text ? "\n" : ""}${block}\n`);
    written.push(name);
  }
  return written;
}
