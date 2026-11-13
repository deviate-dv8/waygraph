// A live session's `register`: the selector a person picked in the browser, written into the `_sel.ts` of the page they were on.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Node, Project } from "ts-morph";
import { addSelector } from "../../manifest/selector-write.js";
import type { BlockEntry } from "../../manifest/project.js";
import type { RegisterResponse } from "./protocol.js";

/** Adds `key: selector` to the selector object of the Page Block for Checkpoint `page`; its name (`HomeSel.press`) is the answer. */
export function registerSelectorFor(projectDir: string, blocks: readonly BlockEntry[], page: string, key: string, selector: string): RegisterResponse {
  if (!/^[A-Za-z_]\w*$/.test(key)) return { ok: false, error: `"${key}" is not a name a selector can have (letters, digits, _)` };
  const owner = blocks.find((b) => (b.block as { __waygraphKind?: string }).__waygraphKind === "page" && ((b.block as { __waygraphTo?: string[] }).__waygraphTo ?? []).includes(page));
  if (!owner) return { ok: false, error: `no page for ${page} (a Page Block with that Checkpoint)` };
  const file = join(projectDir, dirname(owner.file), "_sel.ts");
  if (!existsSync(file)) return { ok: false, error: `${relative(projectDir, file)} doesn't exist: waygraph gen page makes it` };
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("sel.ts", readFileSync(file, "utf8"));
  const object = sf.getVariableDeclarations().find((d) => Node.isObjectLiteralExpression(d.getInitializer() ?? d) || Node.isAsExpression(d.getInitializer()));
  const name = object?.getName();
  if (!name) return { ok: false, error: `${relative(projectDir, file)} has no selector object` };
  if (!addSelector(project, file, name, key, selector)) return { ok: false, error: `${name}.${key} is already there` };
  return { ok: true, file: relative(projectDir, file), name: `${name}.${key}` };
}
