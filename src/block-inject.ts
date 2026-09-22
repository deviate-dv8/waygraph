/**
 * Merge Block libraries / graphs from extra project roots into a host session
 * (waygraph browser `--inject`). Presets name bundled or well-known checkouts.
 */
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/** Human label for an injected root (used in merged `file` paths). */
export function injectLabel(root: string): string {
  return basename(root.replace(/\/$/, ""));
}

/**
 * Display path for a Block discovered under an inject root (not the host cwd).
 * Primary project files stay relative as-is; injected ones are tagged `@label/...`.
 */
export function injectTaggedFile(hostDir: string, root: string, relFile: string): string {
  const host = resolve(hostDir);
  const r = resolve(root);
  if (r === host) return relFile.replace(/\\/g, "/");
  return `@${injectLabel(r)}/${relFile.replace(/\\/g, "/")}`;
}

const PRESETS: Record<string, () => string | null> = {
  saucedemo: () => join(packageRoot(), "examples", "saucedemo"),
  demosauce: () => join(packageRoot(), "examples", "saucedemo"),
  veciro: () => {
    if (process.env.WAYGRAPH_INJECT_VECIRO) {
      return resolve(process.env.WAYGRAPH_INJECT_VECIRO);
    }
    for (const c of [
      join(homedir(), "Desktop", "Work", "veciro-waygraph"),
      join(homedir(), "Desktop", "Projects", "veciro-waygraph"),
    ]) {
      if (existsSync(c)) return c;
    }
    return null;
  },
};

/**
 * Resolve one `--inject` token to an absolute directory (preset name or path).
 */
export function resolveInjectRoot(token: string, cwd = process.cwd()): string {
  const raw = token.trim();
  if (!raw) throw new Error("waygraph inject: empty --inject value");
  const preset = PRESETS[raw.toLowerCase()];
  if (preset) {
    const dir = preset();
    if (!dir || !existsSync(dir)) {
      throw new Error(
        `waygraph inject: preset "${raw}" not found on disk (pass an absolute path to the Block library root)`,
      );
    }
    return resolve(dir);
  }
  const abs = resolve(cwd, raw);
  if (!existsSync(abs)) {
    throw new Error(`waygraph inject: no such directory: ${abs}`);
  }
  return abs;
}

export function resolveInjectRoots(tokens: string[], cwd = process.cwd()): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const abs = resolveInjectRoot(t, cwd);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** Roots to scan: host project first, then each inject path (deduped). */
export function exploreRoots(projectDir: string, inject?: string[]): string[] {
  const host = resolve(projectDir);
  const extra = inject ?? [];
  const seen = new Set<string>([host]);
  const roots = [host];
  for (const r of extra) {
    const abs = resolve(r);
    if (seen.has(abs)) continue;
    seen.add(abs);
    roots.push(abs);
  }
  return roots;
}
