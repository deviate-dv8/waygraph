/**
 * Shared `--blocks` select grammar (RFC Phase C).
 *
 * - `/pattern/`  -> regex on relative file path OR block name
 * - has `*`/`**` -> glob on relative file path (picomatch: `**`, `*`, `?`, `{a,b}`, `[abc]`)
 * - otherwise    -> bare token (flow export / checkpoint / block name) — caller decides
 */

import picomatch from "picomatch";
import { toPosix } from "./scan.js";

export type BlocksSelectKind = "regex" | "glob" | "bare";

/** A parsed `--blocks` selector: which Blocks, by name, glob or file, a command should use. */
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

/** Parses a `--blocks` argument into a selector. */
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

/** True when a Block name and file match a parsed `--blocks` selector. */
export function matchBlocksSelect(
  select: BlocksSelect,
  opts: { relFile: string; blockName?: string },
): boolean {
  const file = toPosix(opts.relFile);
  const name = opts.blockName ?? "";
  if (select.kind === "regex") {
    const re = select.re ?? new RegExp(select.pattern);
    return re.test(file) || (name !== "" && re.test(name));
  }
  if (select.kind === "glob") {
    return picomatch.isMatch(file, toPosix(select.pattern));
  }
  // bare: match block name equality (case-sensitive) or path substring
  if (name && name === select.pattern) return true;
  if (file.includes(select.pattern)) return true;
  return false;
}
