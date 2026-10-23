// Reads `<In, Out>` type arguments out of Block source text. Only for Blocks still written in the deprecated form; a Block
// declared with Checkpoint values carries its route at runtime and never reaches this.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Resolves `typeName` to every literal Checkpoint tag it can mean, within
 * one `*.states.ts` file's own source text - `type X = Checkpoint<"Tag">`
 * directly, or `type X = A | B | Checkpoint<"C">` (a union of other type
 * names and/or inline Checkpoint literals) recursively. A cycle or unknown
 * identifier just contributes no tags, rather than throwing - callers treat
 * an empty result as "couldn't resolve," not a crash.
 */
function resolveCheckpointTags(statesSrc: string, typeName: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(typeName)) return [];
  seen.add(typeName);
  const direct = new RegExp(`type\\s+${typeName}\\s*=\\s*Checkpoint<"([^"]+)">`).exec(statesSrc);
  if (direct) return [direct[1]!];
  const aliased = new RegExp(`type\\s+${typeName}\\s*=\\s*([^;]+);`).exec(statesSrc);
  if (!aliased) return [];
  const tags: string[] = [];
  for (const member of aliased[1]!.split("|").map((s) => s.trim()).filter(Boolean)) {
    const inline = /^Checkpoint<"([^"]+)">$/.exec(member);
    if (inline) {
      tags.push(inline[1]!);
    } else if (/^[A-Za-z_$][\w]*$/.test(member)) {
      tags.push(...resolveCheckpointTags(statesSrc, member, seen));
    }
  }
  return tags;
}

/**
 * Finds which file `blockFilePath`'s own `import type { ... }` statements
 * say `typeName` comes from, resolved to a real path on disk (`.js` ->
 * `.ts`, matching this project's own NodeNext import convention). Only
 * follows relative imports - `typeName` imported from a package (e.g.
 * `waygraph` itself, for `Checkpoint`) has no project file to read.
 */
function findTypeSourceFile(blockFilePath: string, typeName: string): string | null {
  const src = readFileSync(blockFilePath, "utf-8");
  const importRe = /import\s+type\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    const names = m[1]!.split(",").map((s) => s.trim());
    if (!names.includes(typeName)) continue;
    const importPath = m[2]!;
    if (!importPath.startsWith(".")) continue;
    const resolved = join(dirname(blockFilePath), importPath.replace(/\.js$/, ".ts"));
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

/** `findTypeSourceFile` + `resolveCheckpointTags`, chained - `[]` on any failure along the way. */
function resolveTypeToTags(blockFilePath: string, typeName: string): string[] {
  const statesFile = findTypeSourceFile(blockFilePath, typeName);
  if (!statesFile) return [];
  return resolveCheckpointTags(readFileSync(statesFile, "utf-8"), typeName);
}

/**
 * Resolves one `defineBlock<In, Out>` generic argument, as captured by
 * `extractDefineBlockGenerics` - either a plain type identifier (goes
 * through `resolveTypeToTags`), an inline `Checkpoint<"Tag">` literal, or
 * the documented wildcard forms `Checkpoint<string>`/`Checkpoint<any>` (a
 * Block reused across several entry points, e.g. this project's own
 * `AddToCartBlock` - reachable from anywhere, same as a NavBlock's own `"*"`).
 */
export function resolveGenericArg(blockFilePath: string, arg: string): string[] {
  if (arg === "Checkpoint<string>" || arg === "Checkpoint<any>") return ["*"];
  const inline = /^Checkpoint<"([^"]+)">$/.exec(arg);
  if (inline) return [inline[1]!];
  return resolveTypeToTags(blockFilePath, arg);
}

/** Every `defineBlock` / `defineEffectBlock` / `defineMemEffectBlock` `<In, Out>` call site. */
export function extractDefineBlockGenerics(src: string): { in: string; out: string }[] {
  // Each argument is either a plain identifier or an inline `Checkpoint<...>`
  // (its own angle brackets, so the outer defineX<...> pair alone won't
  // balance correctly against a naive greedy match) - captured as a single
  // alternation so both shapes come out of the same two capture groups.
  // Effect helpers are TypeScript salt over defineBlock - same In/Out edges.
  const arg = String.raw`(Checkpoint<[^>]*>|[A-Za-z_$][\w]*)`;
  const re = new RegExp(
    String.raw`define(?:(?:Mem)?Effect|Method|Action)?Block<\s*${arg}\s*,\s*${arg}\s*>`,
    "g",
  );
  // Matches: defineBlock | defineMethodBlock | defineActionBlock | defineEffectBlock |
  // defineMemEffectBlock (Nav / NavClick / Page use runtime markers, not this regex.)
  const calls: { in: string; out: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    calls.push({ in: m[1]!, out: m[2]! });
  }
  return calls;
}

