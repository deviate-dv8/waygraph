/**
 * Shared `--blocks` select grammar (RFC Phase C).
 *
 * - `/pattern/`  -> regex on relative file path OR block name
 * - has `*`/`**` -> glob on relative file path (POSIX-ish)
 * - otherwise    -> bare token (flow export / checkpoint / block name) — caller decides
 */
import { relative } from "node:path";

export type BlocksSelectKind = "regex" | "glob" | "bare";

export interface BlocksSelect {
  kind: BlocksSelectKind;
  /** Original token. */
  raw: string;
  /** For regex: compiled without wrapping slashes. For glob: pattern as given. */
  pattern: string;
  re?: RegExp;
}

/** True when the token is file-select (glob/regex), not a bare flow/checkpoint name. */
export function isFileSelectToken(token: string): boolean {
  if (!token) return false;
  if (token.length >= 2 && token.startsWith("/") && token.endsWith("/") && token.length > 2) {
    return true;
  }
  return token.includes("*");
}

export function parseBlocksSelect(token: string): BlocksSelect {
  const raw = token.trim();
  if (raw.length >= 2 && raw.startsWith("/") && raw.endsWith("/")) {
    const body = raw.slice(1, -1);
    return { kind: "regex", raw, pattern: body, re: new RegExp(body) };
  }
  if (raw.includes("*")) {
    return { kind: "glob", raw, pattern: raw };
  }
  return { kind: "bare", raw, pattern: raw };
}

/** Glob → RegExp (simple: ** / * / ? only; no brace expansion). */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
      continue;
    }
    if (c === "*") {
      out += "[^/]*";
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      continue;
    }
    if (".+^${}()|[]\\".includes(c)) out += "\\" + c;
    else out += c;
  }
  return new RegExp("^" + out + "$");
}

export function matchBlocksSelect(
  select: BlocksSelect,
  opts: { relFile: string; blockName?: string },
): boolean {
  const file = opts.relFile.replace(/\\/g, "/");
  const name = opts.blockName ?? "";
  if (select.kind === "regex") {
    const re = select.re ?? new RegExp(select.pattern);
    return re.test(file) || (name !== "" && re.test(name));
  }
  if (select.kind === "glob") {
    return globToRegExp(select.pattern.replace(/\\/g, "/")).test(file);
  }
  // bare: match block name equality (case-sensitive) or path substring
  if (name && name === select.pattern) return true;
  if (file.includes(select.pattern)) return true;
  return false;
}

export function filterByBlocksSelect<T extends { file: string; block?: string }>(
  items: T[],
  select: BlocksSelect | undefined,
  projectDir: string,
): T[] {
  if (!select) return items;
  return items.filter((it) => {
    const relFile = it.file.startsWith(projectDir)
      ? relative(projectDir, it.file)
      : it.file;
    return matchBlocksSelect(select, {
      relFile: relFile.replace(/\\/g, "/"),
      ...(it.block !== undefined ? { blockName: it.block } : {}),
    });
  });
}
