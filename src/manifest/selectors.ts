// Where each Block, Read Block and flow is written, and the selectors it uses, read from the source (ts-morph), not
// by running anything: the manifest links a Block to its code and its `_sel.ts` entries with it.
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import { parseSource } from "./source.js";

/** The lines an export's definition spans (1-based, inclusive). */
export interface SourceSpan {
  line: number;
  endLine: number;
}

/** One entry of a selector object (`LoginSel.submit`): the string, or the code that builds one (a function). */
export interface SelectorEntry {
  /** `LoginSel.submit` */
  name: string;
  /** The selector string, or the entry's code when it isn't a plain string (`(id) => \`[data-id=${id}]\``). */
  selector: string;
  literal: boolean;
  /** Project-relative file and line of the entry. */
  file: string;
  line: number;
}

/** A selector file: `_sel.ts` beside a page's Blocks, or `<name>.sel.ts`. */
export const isSelectorFile = (file: string): boolean => /(^|[._])sel\.ts$/.test(basename(file));
const isSelectorModule = (specifier: string): boolean => /(^|[/._])sel(\.[jt]s)?$/.test(specifier);

const parsed = new Map<string, SourceFile>();
function sourceOf(absFile: string): SourceFile | undefined {
  if (!existsSync(absFile)) return undefined;
  let sf = parsed.get(absFile);
  if (!sf) {
    sf = parseSource(absFile);
    parsed.set(absFile, sf);
  }
  return sf;
}

/** Forgets what was parsed: a new manifest reads the files as they are now. */
export function forgetSources(): void {
  parsed.clear();
}

/** The statement that defines `exportName` (`export const X = ...`, `export function X`). */
function definitionOf(sf: SourceFile, exportName: string): Node | undefined {
  for (const statement of sf.getStatements()) {
    if (Node.isVariableStatement(statement) && statement.getDeclarations().some((d) => d.getName() === exportName)) return statement;
    if ((Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) && statement.getName() === exportName) return statement;
  }
  return undefined;
}

/** Where `exportName` is defined in `absFile`, its doc comment included; undefined when the file or export isn't found. */
export function spanOf(absFile: string, exportName: string): SourceSpan | undefined {
  const sf = sourceOf(absFile);
  const node = sf && definitionOf(sf, exportName);
  return node ? { line: node.getStartLineNumber(true), endLine: node.getEndLineNumber() } : undefined;
}

/** Every entry of the selector objects `absFile` exports (`export const LoginSel = { ... }`). */
export function selectorEntries(absFile: string, relFile: string): SelectorEntry[] {
  const sf = sourceOf(absFile);
  if (!sf) return [];
  const out: SelectorEntry[] = [];
  for (const statement of sf.getVariableStatements()) {
    if (!statement.isExported()) continue;
    for (const declaration of statement.getDeclarations()) {
      let init = declaration.getInitializer();
      // `{ ... } as const`, `{ ... } satisfies X`
      while (Node.isAsExpression(init) || Node.isSatisfiesExpression(init)) init = init.getExpression();
      if (!Node.isObjectLiteralExpression(init)) continue;
      for (const property of init.getProperties()) {
        if (!Node.isPropertyAssignment(property) && !Node.isMethodDeclaration(property)) continue;
        const value = Node.isPropertyAssignment(property) ? property.getInitializer() : property;
        const literal = Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value);
        out.push({
          name: `${declaration.getName()}.${property.getName()}`,
          selector: literal ? value.getLiteralValue() : (value?.getText() ?? ""),
          literal,
          file: relFile,
          line: property.getStartLineNumber(),
        });
      }
    }
  }
  return out;
}

/**
 * The selector entries the definition of `exportName` uses: each `Sel.member` it reads, where `Sel` is imported from a
 * selector file (by any local name). Indirection (`const s = LoginSel`) isn't followed.
 */
export function selectorsUsed(absFile: string, exportName: string, projectDir: string): SelectorEntry[] {
  const sf = sourceOf(absFile);
  const node = sf && definitionOf(sf, exportName);
  if (!sf || !node) return [];
  // Local name -> the selector file and the name it exports it as.
  const imported = new Map<string, { absFile: string; name: string }>();
  for (const declaration of sf.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    if (!specifier.startsWith(".") || !isSelectorModule(specifier)) continue;
    const target = resolve(dirname(absFile), specifier).replace(/\.js$/, ".ts");
    const file = existsSync(target) ? target : `${target}.ts`;
    for (const named of declaration.getNamedImports()) {
      imported.set(named.getAliasNode()?.getText() ?? named.getName(), { absFile: file, name: named.getName() });
    }
  }
  if (!imported.size) return [];
  const seen = new Set<string>();
  const out: SelectorEntry[] = [];
  for (const access of node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const from = imported.get(access.getExpression().getText());
    if (!from) continue;
    const name = `${from.name}.${access.getName()}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const rel = relativeTo(projectDir, from.absFile);
    const entry = selectorEntries(from.absFile, rel).find((e) => e.name === name);
    if (entry) out.push(entry);
  }
  return out;
}

function relativeTo(projectDir: string, absFile: string): string {
  const root = resolve(projectDir);
  return absFile.startsWith(root + "/") || absFile.startsWith(root + "\\") ? absFile.slice(root.length + 1).replace(/\\/g, "/") : absFile;
}

/** The project's selector files, project-relative. */
export function selectorFilesUnder(projectDir: string, walk: (dir: string, pattern: RegExp) => string[]): string[] {
  return walk(join(projectDir, "src"), /(^|[/\\._])sel\.ts$/).filter(isSelectorFile).map((f) => relativeTo(projectDir, f));
}
