// `waygraph upgrade --codemod checkpoints`: rewrites a project from tag strings and `<In, Out>` type arguments to
// Checkpoint values (`export const Home = checkpoint("Home")`, `checkpoint: Home`, `from: Home, to: ItemInCart`).
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { walkDir } from "../manifest/scan.js";

/** Checkpoint name -> tag, and union aliases -> member names, found in the states files. */
interface StatesInfo {
  tags: Map<string, string>;
  unions: Map<string, string[]>;
}

const SINGLE = /^export type (\w+) = Checkpoint<"([^"]+)">;$/gm;
const UNION = /^export type (\w+) = (\w+(?:\s*\|\s*\w+)+);$/gm;

/** Rewrites one states file; returns the new text and what it declared. */
export function convertStates(text: string, info: StatesInfo): string {
  // Already-converted declarations still count (the codemod can run again after a partial run).
  for (const m of text.matchAll(/^export const (\w+) = checkpoint\("([^"]+)"\);$/gm)) info.tags.set(m[1]!, m[2]!);
  for (const m of text.matchAll(/^export const (\w+) = \[([\w,\s]+)\] as const;$/gm)) {
    info.unions.set(m[1]!, m[2]!.split(",").map((n) => n.trim()).filter(Boolean));
  }
  let out = text.replace(SINGLE, (_all, name: string, tag: string) => {
    info.tags.set(name, tag);
    return `export const ${name} = checkpoint("${tag}");\nexport type ${name} = typeof ${name};`;
  });
  out = out.replace(UNION, (all, name: string, members: string) => {
    const names = members.split("|").map((m) => m.trim());
    if (!names.every((n) => info.tags.has(n) || info.unions.has(n))) return all;
    const flat = names.flatMap((n) => info.unions.get(n) ?? [n]);
    info.unions.set(name, flat);
    return `export const ${name} = [${flat.join(", ")}] as const;\nexport type ${name} = (typeof ${name})[number];`;
  });
  if (out !== text) {
    out = out.replace(/import type \{ Checkpoint \} from "waygraph";/, 'import { checkpoint } from "waygraph";');
    if (/\bCheckpoint</.test(out.replace(/^import.*$/gm, "")) && !/\bimport type \{[^}]*\bCheckpoint\b/.test(out)) {
      out = out.replace('import { checkpoint } from "waygraph";', 'import { checkpoint } from "waygraph";\nimport type { Checkpoint } from "waygraph";');
    }
  }
  return out;
}

const SINGLE_CHECKPOINT = ["defineNavBlock", "defineNavClickBlock", "defineMemNavBlock", "definePageBlock", "defineAssertBlock"];
const ROUTED = ["defineMethodBlock", "defineEffectBlock"];

/** Rewrites one Block file. Calls whose Checkpoints are not plain declared names are left as they are. */
export function convertBlocks(text: string, info: StatesInfo): { text: string; skipped: string[] } {
  const known = (n: string) => info.tags.has(n) || info.unions.has(n);
  const skipped: string[] = [];
  let out = text;
  for (const fn of SINGLE_CHECKPOINT) {
    out = out.replace(new RegExp(`\\b${fn}<(\\w+)>\\(\\s*\\{([\\s\\S]*?)\\bcheckpoint:\\s*"([^"]+)"`, "g"), (all, name: string, between: string, tag: string) => {
      if (!info.tags.has(name) || info.tags.get(name) !== tag) {
        skipped.push(`${fn}<${name}>`);
        return all;
      }
      return `${fn}({${between}checkpoint: ${name}`;
    });
  }
  for (const fn of ROUTED) {
    const head = new RegExp(`\\b${fn}<\\s*([^,<>]+(?:<[^<>]*>)?)\\s*,\\s*([^<>]+?)\\s*>\\(\\s*\\{`, "g");
    let m: RegExpExecArray | null;
    let result = "";
    let last = 0;
    while ((m = head.exec(out)) !== null) {
      const [all, rawFrom, rawTo] = m as unknown as [string, string, string];
      const from = rawFrom.trim();
      const to = rawTo.trim();
      const wildcard = from === "Checkpoint<string>";
      if ((!wildcard && !known(from)) || !known(to)) {
        skipped.push(`${fn}<${from}, ${to}>`);
        continue;
      }
      result += out.slice(last, m.index) + `${fn}({`;
      // from/to go right after the name (and description) lines, matching how the rest of the options read
      let rest = out.slice(m.index + all.length);
      const nameLine = /^(\s*\n)?(\s*)name: [^\n]*\n(\s*description:[\s\S]*?",?\n(?=\s*\w+:))?/.exec(rest);
      const indent = nameLine?.[2] ?? "  ";
      const decl = `${wildcard ? "" : `${indent}from: ${from},\n`}${indent}to: ${to},\n`;
      if (nameLine) rest = nameLine[0] + decl + rest.slice(nameLine[0].length);
      else rest = `\n${decl}` + rest;
      // a resolve that only returns the single `to` is now implied
      const tag = info.tags.get(to);
      if (tag) rest = rest.replace(new RegExp(`\\n\\s*resolve: \\(\\) => checkpoint\\("${tag}"\\),`), "");
      out = result + rest;
      head.lastIndex = result.length;
      last = result.length;
      result = out.slice(0, last);
    }
  }
  const body = (t: string) => t.replace(/^import[\s\S]*?;$/gm, "");
  if (out !== text && !/\bCheckpoint\b/.test(body(out))) {
    out = out.replace(/(import \{[^}]*?)\btype Checkpoint,\s*/, "$1").replace(/,\s*type Checkpoint(\s*\})/, "$1");
  }
  if (out !== text && !/checkpoint\(/.test(out.replace(/^import[\s\S]*?;$/gm, ""))) {
    out = out.replace(/(import \{[^}]*?)\bcheckpoint,\s*/, "$1").replace(/,\s*checkpoint(\s*\})/, "$1");
  }
  if (out !== text) {
    // Checkpoints are now used as values: import them as values.
    out = out.replace(/import type \{([^}]*)\} from "([^"]*states[^"]*)";/g, (all, names: string, from: string) =>
      names.split(",").some((n) => known(n.trim())) ? `import {${names}} from "${from}";` : all,
    );
  }
  return { text: out, skipped };
}

/** Runs the codemod over a project; returns the files changed and the calls it left alone. */
export function codemodCheckpoints(projectDir: string): { changed: string[]; skipped: string[] } {
  const info: StatesInfo = { tags: new Map(), unions: new Map() };
  const files = walkDir(projectDir, /\.ts$/).filter((f) => !f.includes("node_modules"));
  const states = files.filter((f) => /\.states\.ts$|[/\\]_states\.ts$/.test(f));
  const changed: string[] = [];
  const skipped: string[] = [];
  for (const f of states) {
    const before = readFileSync(f, "utf8");
    const after = convertStates(before, info);
    if (after !== before) {
      writeFileSync(f, after);
      changed.push(relative(projectDir, f));
    }
  }
  for (const f of files.filter((x) => !states.includes(x))) {
    const before = readFileSync(f, "utf8");
    const { text, skipped: s } = convertBlocks(before, info);
    skipped.push(...s.map((c) => `${relative(projectDir, f)}: ${c}`));
    if (text !== before) {
      writeFileSync(f, text);
      changed.push(relative(projectDir, f));
    }
  }
  return { changed, skipped };
}
