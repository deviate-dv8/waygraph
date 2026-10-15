// Native .env support - no `dotenv` dependency (same "bring nothing, read what's already there"
// philosophy as mem-stub.ts's own Faker note: this is a ~20-line parser, not a new runtime dep).
// Real, direct user ask: FE consumers keep their own .env and had to hack around waygraph not
// reading it (manually re-exporting values, duplicating them into package.json's "waygraph"
// field) to get waygraph to see the same config their actual app already uses.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * Auto-loads `.env` / `.env.local` / `.env.<mode>` / `.env.<mode>.local` from a project's root,
 * same layering Vite/Next use (`mode` defaults to `NODE_ENV`, falling back to "development"),
 * merged into `process.env` in increasing priority. A real, already-set `process.env` value -
 * whatever the shell actually exported - always wins over every file; a `.env` file only fills
 * a gap, it never silently overrides something the caller explicitly set. Safe to call more
 * than once (e.g. once eagerly at `cwd`, again once the real project dir is known) - loading
 * twice is a no-op the second time for any key already filled.
 */
export function loadEnvFiles(projectDir: string, mode: string = process.env.NODE_ENV || "development"): void {
  const files = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  for (const name of files) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    let parsed: Record<string, string>;
    try {
      parsed = parseEnvFile(readFileSync(p, "utf-8"));
    } catch {
      continue; // unreadable file - never fail a run over an optional .env
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
