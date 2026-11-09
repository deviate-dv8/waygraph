// `waygraph upgrade --codemod effect`: Effect Blocks become Methods. An Effect was a Method that also listed the rows it
// can act on (`instanceOptions`, for `waygraph auto`'s menu); a Method takes the same list, so `defineEffectBlock` becomes
// `defineMethodBlock` and `EffectBlock` becomes `MethodBlock`, with a name imported twice imported once. Each
// `x.effect.block.ts` is renamed `x.method.block.ts`, and every import of it follows. Works on the TypeScript AST.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { indentationOf } from "../../manifest/source.js";
import { walkDir } from "../../manifest/scan.js";

const RENAMES: Record<string, string> = { defineEffectBlock: "defineMethodBlock", EffectBlock: "MethodBlock" };
const EFFECT_FILE = /\.effect\.block\.ts$/;

/** A file's text with the Effect names renamed and its imports made unique; what's left for a person. */
export function convertEffect(text: string): { text: string; left: { line: number; reason: string }[] } {
  const project = new Project({ useInMemoryFileSystem: true, manipulationSettings: { indentationText: indentationOf(text) } });
  const sf = project.createSourceFile("/file.ts", text);
  const left: { line: number; reason: string }[] = [];
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const to = RENAMES[id.getText()];
    if (to) id.replaceWithText(to);
    // EffectExtras was the two fields an Effect had to have; a Method has them as optional fields of its own.
    else if (id.getText() === "EffectExtras") left.push({ line: id.getStartLineNumber(), reason: "EffectExtras - use the Method's own requires / instanceOptions fields" });
  }
  // `import { defineMethodBlock, defineEffectBlock }` is now the same name twice.
  for (const decl of sf.getImportDeclarations()) {
    const seen = new Set<string>();
    for (const named of decl.getNamedImports()) {
      const key = `${named.isTypeOnly() ? "type " : ""}${named.getName()} as ${named.getAliasNode()?.getText() ?? ""}`;
      const plain = `${named.getName()} as ${named.getAliasNode()?.getText() ?? ""}`;
      if (seen.has(key) || seen.has(plain)) named.remove();
      else seen.add(key);
    }
  }
  return { text: sf.getFullText(), left };
}

/** An import or export specifier naming a renamed Effect file, pointed at its new name. */
function followRenames(text: string, file: string, renamed: Set<string>): string {
  return text.replace(/(["'])(\.{1,2}\/[^"']*?)\.effect\.block\.js\1/g, (whole, quote: string, path: string) => {
    const target = resolve(dirname(file), `${path}.effect.block.ts`);
    return renamed.has(target) ? `${quote}${path}.method.block.js${quote}` : whole;
  });
}

/** Runs `--codemod effect` over a project; returns the files changed and what's left by hand. */
export function codemodEffect(dir: string): { changed: string[]; problems: string[] } {
  const changed = new Set<string>();
  const problems: string[] = [];
  const files = walkDir(dir, /\.ts$/).filter((f) => !f.endsWith(".d.ts"));
  // First the files: an Effect's file is named after its kind.
  const renamed = new Set<string>();
  for (const file of files.filter((f) => EFFECT_FILE.test(f))) {
    const to = file.replace(EFFECT_FILE, ".method.block.ts");
    if (existsSync(to)) {
      problems.push(`${relative(dir, file)}: ${relative(dir, to)} exists - rename it by hand`);
      continue;
    }
    renameSync(file, to);
    renamed.add(file);
    changed.add(relative(dir, to));
  }
  for (const file of files.map((f) => (renamed.has(f) ? f.replace(EFFECT_FILE, ".method.block.ts") : f))) {
    const before = readFileSync(file, "utf8");
    let text = renamed.size ? followRenames(before, file, renamed) : before;
    if (/defineEffectBlock|EffectBlock|EffectExtras/.test(text)) {
      const converted = convertEffect(text);
      text = converted.text;
      problems.push(...converted.left.map((l) => `${relative(dir, file)}:${l.line}: ${l.reason}`));
    }
    if (text !== before) {
      writeFileSync(file, text);
      changed.add(relative(dir, file));
    }
  }
  return { changed: [...changed], problems };
}
