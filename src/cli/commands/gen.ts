// `waygraph gen <what> <name> [options]`: files from the convention, so each page, Method, flow and key starts the same
// shape whoever writes it (a person or an agent). It never overwrites a file, prints what it wrote, and ends by writing the
// page names (`waygraph types`) so what it made already completes.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ObjectLiteralExpression } from "ts-morph";
import { parseCommand, type OptionTable } from "../args.js";
import { accountFile, flowFile, keysFile, methodFile, pageFile, selFile } from "../gen/templates.js";
import { camel, kebab, pageNames } from "../gen/names.js";

const OPTIONS = {
  read: { type: "string", value: "a,b", help: "Fields the page shows (its read)" },
  do: { type: "string", value: "a,b", help: "Methods of the page, by key (fillEmail,submit)" },
  query: { type: "string", value: "a,b", help: "Query params the page keeps in its address" },
  from: { type: "string", value: "a,b", help: "The pages it opens from, by name (Dashboard,Login); none: from anywhere" },
  frame: { type: "string", value: "SELECTOR", help: "The iframe the page lives in" },
  url: { type: "string", value: "PATH", help: "The page's address, when it isn't its folder" },
  name: { type: "string", value: "Name", help: "The page's Checkpoint, when its path's would be awkward" },
  group: { type: "string", value: "(group)", help: "The src/map group folder (default: the project's first)" },
  shell: { type: "boolean", help: "A page that covers its children (a sidebar, a top bar)" },
  inline: { type: "boolean", help: "Write Methods in the page, not in _methods/" },
  dry: { type: "boolean", help: "Print what would be written, write nothing" },
} as const satisfies OptionTable;

const list = (value: string | undefined): string[] => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** What a run wrote and skipped, for its report. */
class Writer {
  written: string[] = [];
  skipped: string[] = [];
  constructor(
    private readonly dir: string,
    private readonly dry: boolean,
  ) {}
  write(file: string, text: string): void {
    const rel = relative(this.dir, file);
    if (existsSync(file)) return void this.skipped.push(rel);
    this.written.push(rel);
    if (this.dry) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** The group folder pages go in: the one asked for, else the first of `src/map/` that isn't external or api, else `(app_base)`. */
function groupOf(dir: string, asked: string | undefined): string {
  if (asked) return asked;
  const map = join(dir, "src", "map");
  const found = existsSync(map) ? readdirSync(map).filter((d) => /^\(.+\)$/.test(d) && !/^\((external|api)\)$/.test(d)) : [];
  return found[0] ?? "(app_base)";
}

/** Every page file under the map, for a page path: `src/map/<group>/<segments>/_page.block.ts`. */
function pageFileOf(dir: string, segments: string[]): string | undefined {
  const map = join(dir, "src", "map");
  const groups = existsSync(map) ? readdirSync(map).filter((d) => /^\(.+\)$/.test(d)) : [];
  for (const base of [map, ...groups.map((g) => join(map, g))]) {
    const file = join(base, ...segments, "_page.block.ts");
    if (existsSync(file)) return file;
  }
  return undefined;
}

/** How the end of an import path is written: `.js`, as the NodeNext projects waygraph makes do. */
const EXT = ".js";

/** `text` as the last property of `obj`, on its own line, indented as the properties are: returns the file's new text. */
function withProperty(full: string, obj: ObjectLiteralExpression, text: string): string {
  const close = obj.getEnd() - 1;
  let i = close - 1;
  while (/\s/.test(full[i] ?? "")) i--;
  const lineStart = full.lastIndexOf("\n", close) + 1;
  const closeIndent = /^\s*/.exec(full.slice(lineStart, close))?.[0] ?? "";
  const comma = full[i] === "," || full[i] === "{" ? "" : ",";
  return `${full.slice(0, i + 1)}${comma}\n${closeIndent}  ${text},\n${closeIndent}${full.slice(close)}`;
}

/** Adds `key: "TODO"` to the selector object `selName` of `file`, when it isn't there. */
function addSelector(project: Project, file: string, selName: string, key: string): boolean {
  if (!existsSync(file)) return false;
  const sf = project.createSourceFile(file, readFileSync(file, "utf8"), { overwrite: true });
  let init = sf.getVariableDeclaration(selName)?.getInitializer();
  while (Node.isAsExpression(init) || Node.isSatisfiesExpression(init)) init = init.getExpression();
  if (!Node.isObjectLiteralExpression(init) || init.getProperty(key)) return false;
  writeFileSync(file, withProperty(sf.getFullText(), init, `${key}: "TODO"`));
  return true;
}

/** Registers the Method `key` (its file or its inline body) in the page's `do`. */
function addToPage(project: Project, file: string, key: string, entry: string, importFrom: string | undefined): boolean {
  const sf = project.createSourceFile(file, readFileSync(file, "utf8"), { overwrite: true });
  const call = sf.getDescendantsOfKind(SyntaxKind.CallExpression).find((c) => c.getExpression().getText() === "definePageBlock");
  const options = call?.getArguments()[0];
  if (!Node.isObjectLiteralExpression(options)) return false;
  const doProp = options.getProperty("do");
  const arrow = Node.isPropertyAssignment(doProp) ? doProp.getInitializer() : undefined;
  let record: Node | undefined = Node.isArrowFunction(arrow) ? arrow.getBody() : undefined;
  while (Node.isParenthesizedExpression(record)) record = record.getExpression();
  if (Node.isObjectLiteralExpression(record)) {
    if (record.getProperty(key)) return false;
    let text = withProperty(sf.getFullText(), record as ObjectLiteralExpression, `${key}: ${entry}`);
    if (Node.isArrowFunction(arrow) && !arrow.getParameters().length) text = text.replace(/(do:\s*)\(\)(\s*=>)/, "$1(self)$2");
    sf.replaceWithText(text);
  } else if (!doProp) {
    const at = options.getProperties().findIndex((p) => Node.isPropertyAssignment(p) && p.getName() === "expects");
    options.insertPropertyAssignment(at < 0 ? options.getProperties().length : at, { name: "do", initializer: `(self) => ({\n    ${key}: ${entry},\n  })` });
  } else return false;
  if (importFrom) {
    // After the page's last import, as the generated page has them.
    const last = sf.getImportDeclarations().at(-1);
    sf.insertImportDeclaration(last ? last.getChildIndex() + 1 : 0, { moduleSpecifier: importFrom, namedImports: [key] });
  }
  writeFileSync(file, sf.getFullText());
  return true;
}

export async function genCase(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand("gen", OPTIONS, args.slice(1));
  const [what, target, ...rest] = positionals;
  const dir = process.cwd();
  const out = new Writer(dir, values.dry === true);
  const project = new Project({ useInMemoryFileSystem: true });
  const ext = EXT;
  if (!what || !target) {
    console.error("waygraph gen <page|method|flow|keys|account> <name> [options]   e.g. waygraph gen page requests/[id] --read title --do fillName,save");
    process.exit(1);
  }

  if (what === "page") {
    const names = pageNames(target, values.name);
    const folder = join(dir, "src", "map", groupOf(dir, values.group), ...names.segments);
    const methods = list(values.do).map(camel);
    const reads = list(values.read).map(camel);
    const keys = [...new Set(["heading", ...reads, ...methods])];
    out.write(
      join(folder, "_page.block.ts"),
      pageFile({
        names,
        ...(values.url !== undefined ? { url: values.url } : {}),
        ...(values.from ? { from: values.from } : {}),
        query: list(values.query),
        ...(values.frame ? { frame: values.frame } : {}),
        reads,
        methods,
        inline: values.inline === true,
        shell: values.shell === true,
        ext,
      }),
    );
    out.write(join(folder, "_sel.ts"), selFile(names.selName, values.shell ? [...methods] : keys));
    if (values.inline !== true) for (const m of methods) out.write(join(folder, "_methods", `${kebab(m)}.method.block.ts`), methodFile(m, names, ext));
  } else if (what === "method") {
    const key = camel(rest[0] ?? "");
    if (!key) return void console.error("waygraph gen method <page path> <key>");
    const names = pageNames(target, values.name);
    const pageFile = pageFileOf(dir, names.segments);
    if (!pageFile) return void console.error(`waygraph gen: no page at ${target} (looked for _page.block.ts under src/map)`);
    const folder = dirname(pageFile);
    const method = join(folder, "_methods", `${kebab(key)}.method.block.ts`);
    // The Checkpoint the page declares, when it isn't what its path gives.
    const declared = /checkpoint:\s*"([^"]+)"/.exec(readFileSync(pageFile, "utf8"))?.[1] ?? names.checkpoint;
    const real = { ...names, checkpoint: declared, selName: `${declared}Sel` };
    if (values.dry !== true) {
      if (values.inline === true) {
        const body = `self.method({ async act(page) { await page.locator(${real.selName}.${key}).click(); } })`;
        if (!addToPage(project, pageFile, key, body, undefined)) console.warn(`waygraph gen: ${key} is already in the page (or its do isn't an object); left alone`);
      } else {
        out.write(method, methodFile(key, real, ext));
        if (!addToPage(project, pageFile, key, `${key}(self)`, `./_methods/${kebab(key)}.method.block${ext}`)) console.warn(`waygraph gen: ${key} is already in the page (or its do isn't an object); left alone`);
      }
      addSelector(project, join(folder, "_sel.ts"), real.selName, key);
    } else out.written.push(relative(dir, method));
  } else if (what === "flow") {
    const names = pageNames(target.split("/").slice(0, -1).join("/") || target);
    const flowName = target.split("/").pop() ?? "flow";
    const pageFile = pageFileOf(dir, names.segments);
    const keys = pageFile ? [...(/\bdo:\s*\(\w*\)\s*=>\s*\(\{([\s\S]*?)\}\)/.exec(readFileSync(pageFile, "utf8"))?.[1]?.matchAll(/^\s{2,4}(\w+):/gm) ?? [])].map((m) => m[1] ?? "") : [];
    const alias = existsSync(join(dir, "package.json")) && readFileSync(join(dir, "package.json"), "utf8").includes('"#flows/*"');
    const pageDeclared = pageFile ? (/export const (\w+) = definePageBlock/.exec(readFileSync(pageFile, "utf8"))?.[1] ?? names.exportName) : names.exportName;
    const group = groupOf(dir, values.group);
    out.write(
      join(dir, "src", "flows", ...target.split("/").slice(0, -1), `${kebab(flowName)}.flow.ts`),
      flowFile({
        flow: `${camel(names.segments.join(" ") + " " + flowName)}Flow`,
        pageImport: alias ? `#map/${group}/${names.segments.join("/")}/_page.block` : `../../map/${group}/${names.segments.join("/")}/_page.block${ext}`,
        engineImport: alias ? "#config/waygraph.config" : `../../../config/waygraph.config${ext}`,
        exportName: pageDeclared,
        keys,
      }),
    );
  } else if (what === "keys") {
    out.write(join(dir, "src", "states", `${kebab(target)}.mem-keys.ts`), keysFile(camel(target), list(rest[0]).map(camel)));
  } else if (what === "account") {
    out.write(join(dir, "src", "accounts", `${kebab(target)}.ts`), accountFile(camel(target)));
  } else {
    console.error(`waygraph gen: don't know how to make a "${what}" (page, method, flow, keys, account)`);
    process.exit(1);
  }

  for (const f of out.written) console.log(`  ${values.dry === true ? "would write" : "created   "} ${f}`);
  for (const f of out.skipped) console.log(`  exists     ${f}  (left alone)`);
  if (values.dry !== true && (what === "page" || what === "method") && existsSync(join(dir, "node_modules", "waygraph"))) {
    try {
      await (await import("./types.js")).writePageTypes(dir);
    } catch (err) {
      console.warn(`waygraph types: ${String(err)}`);
    }
  }
}
