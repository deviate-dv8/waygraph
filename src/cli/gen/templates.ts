// The files `waygraph gen` writes. Plain text, one shape for each kind: a page, a Method of it, its selectors, a flow.
import { actionOf, kebab } from "./names.js";
import type { PageNames } from "./names.js";

export interface PageSpec {
  names: PageNames;
  /** `route: "folder"` (the default), or an address written out. */
  url?: string;
  from?: string;
  query: string[];
  frame?: string;
  /** What the page shows, by field. */
  reads: string[];
  /** Its Methods, by key. */
  methods: string[];
  /** Methods written in the page, not in `_methods/`. */
  inline: boolean;
  /** A page that covers its children. */
  shell: boolean;
  /** How an import's extension is written in this project. */
  ext: string;
}

/** The statement for one Method written in its page. */
export function inlineMethod(key: string, selName: string): string {
  const call = actionOf(key) === "fill" ? `.fill("TODO")` : `.click()`;
  return `    ${key}: self.method({\n      async act(page) {\n        await page.locator(${selName}.${key})${call};\n      },\n    }),`;
}

/** A Method in its own file (`_methods/<key>.method.block.ts`): a function of its page, importing only the page's type. */
export function methodFile(key: string, names: PageNames, ext: string): string {
  const call = actionOf(key) === "fill" ? `.fill("TODO")` : `.click()`;
  return `import type { PageHandle } from "waygraph";
import { ${names.selName} } from "../_sel${ext}";

/** TODO: what ${kebab(key).replace(/-/g, " ")} does on the page, in a sentence. */
export const ${key} = (self: PageHandle<"${names.checkpoint}">) =>
  self.method({
    async act(page) {
      await page.locator(${names.selName}.${key})${call};
    },
  });
`;
}

/** The selector file: one entry per thing the page uses, each still to be written. */
export function selFile(selName: string, keys: string[]): string {
  return `// Every selector of this page. "TODO" is a selector nobody has written yet: \`waygraph check\` lists them.
export const ${selName} = {
${keys.map((k) => `  ${k}: "TODO",`).join("\n")}
} as const;
`;
}

export function pageFile(spec: PageSpec): string {
  const { names } = spec;
  const imports = [`import { definePageBlock, Trait } from "waygraph";`, `import { ${names.selName} } from "./_sel${spec.ext}";`];
  if (!spec.inline) for (const m of spec.methods) imports.push(`import { ${m} } from "./_methods/${kebab(m)}.method.block${spec.ext}";`);
  const lines = [`  name: "${names.blockName}",`];
  if (!spec.shell || spec.url !== undefined) lines.push(`  checkpoint: "${names.checkpoint}",`);
  if (!spec.shell) lines.push(spec.url !== undefined ? `  url: ${JSON.stringify(spec.url)},` : `  route: "folder",`);
  if (spec.from) lines.push(`  from: [${spec.from.split(",").map((f) => JSON.stringify(f.trim())).join(", ")}],`);
  if (spec.query.length) lines.push(`  query: [${spec.query.map((q) => JSON.stringify(q)).join(", ")}],`);
  if (spec.frame) lines.push(`  frame: ${JSON.stringify(spec.frame)},`);
  if (spec.shell) {
    lines.push(`  covers: "children",`);
    lines.push(`  links: (self) => ({\n    // home: self.link({ to: "Home", click: ${names.selName}.home }),\n  }),`);
  } else {
    lines.push(`  verify: [Trait.visible(${names.selName}.heading)],`);
  }
  if (spec.reads.length) {
    lines.push(`  read: (ctx) => ({\n${spec.reads.map((r) => `    ${r}: ctx.page.text(${names.selName}.${r}),`).join("\n")}\n  }),`);
  }
  if (spec.methods.length) {
    const entries = spec.inline ? spec.methods.map((m) => inlineMethod(m, names.selName)).join("\n") : spec.methods.map((m) => `    ${m}: ${m}(self),`).join("\n");
    lines.push(`  do: (self) => ({\n${entries}\n  }),`);
  }
  if (!spec.shell) lines.push(`  expects: () => ({}),`);
  return `${imports.join("\n")}\n\nexport const ${names.exportName} = definePageBlock({\n${lines.join("\n")}\n});\n`;
}

export function flowFile(opts: { flow: string; pageImport: string; engineImport: string; exportName: string; keys: string[] }): string {
  const steps = opts.keys.map((k) => `  .method(${opts.exportName}.do.${k})`).join("\n");
  return `import { engine } from "${opts.engineImport}";
import { ${opts.exportName} } from "${opts.pageImport}";

export const ${opts.flow} = engine
  .map()
  .gotoPage(${opts.exportName})${steps ? "\n" + steps : ""};
`;
}

export function keysFile(ns: string, fields: string[]): string {
  return `import { keys } from "waygraph";

export const ${ns.charAt(0).toUpperCase() + ns.slice(1)}Keys = keys("${ns}")<{
${fields.map((f) => `  ${f}: string;`).join("\n")}
}>();
`;
}

export function accountFile(name: string): string {
  return `import { account, map } from "waygraph";

// TODO: how ${name} signs in (a flow, or the Nav to the login page and its Methods).
export const ${name.charAt(0).toUpperCase() + name.slice(1)} = account("${name}", { signIn: map() });
`;
}
