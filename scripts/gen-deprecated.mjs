// Builds docs/deprecated.md from the @deprecated tags in the source (via TypeDoc's JSON), plus the non-API deprecations below.
import { readFileSync, writeFileSync } from "node:fs";

const api = JSON.parse(readFileSync("docs/api/api.json", "utf8"));
const KIND = { 1: "module", 128: "class", 256: "interface", 512: "constructor", 1024: "property", 2048: "method", 4096: "function", 8: "enum", 32: "variable", 2097152: "type", 65536: "method", 262144: "accessor", 1048576: "accessor" };
const text = (parts = []) => parts.map((p) => p.text).join("").trim();
const found = [];

function walk(node, trail) {
  const here = node.name && node.kind !== 1 ? [...trail, node.name] : trail;
  const dep = (node.comment?.blockTags ?? []).find((t) => t.tag === "@deprecated") ?? (node.signatures ?? []).map((s) => (s.comment?.blockTags ?? []).find((t) => t.tag === "@deprecated")).find(Boolean);
  if (dep) found.push({ name: here.join("."), kind: KIND[node.kind] ?? "member", note: text(dep.content).replace(/\{@link ([^}]+)\}/g, "`$1`").replace(/\s+/g, " ") });
  for (const c of node.children ?? []) walk(c, here);
  for (const c of node.type?.declaration?.children ?? []) walk(c, here);
}
walk(api, []);
found.sort((a, b) => a.name.localeCompare(b.name));

const rows = found.map((f) => `| \`${f.name}\` | ${f.kind} | ${f.note || "Deprecated."} |`).join("\n");
const md = `# Deprecated

Everything here still works. It is marked deprecated because something replaces it, and it may be removed before 1.0.0.
The API table below is generated from the \`@deprecated\` tags in the source, so it cannot drift; the rest is maintained by hand.

## API (generated)

| Name | Kind | Use instead |
| --- | --- | --- |
${rows}

## Style and project layout

| Deprecated | Use instead |
| --- | --- |
| \`playwright.config.ts\` in a project | \`config/waygraph.config.ts\` (\`testDir\`, \`webServer\`, \`playwright: { … }\`). \`waygraph test\` still uses an existing one and prints a note. |
| Nested wrappers: \`withTitle(withMemStub(withSessionReset(flow)))\` | Options in \`.end({ title, memStub, sessionReset, … })\` or \`engine.defineFlow(blocks, options)\`. |
| \`withHighlightFixtures(flow, map)\` and \`HighlightFixtureMap\` | ctx stubs chained on the Block where the flow uses it: \`AddItemBlock.stubAfter((ctx) => { ctx.ring(…) })\`. |
| \`withBlockPace(block, pace)\` / \`withDemoPace(flow, pace)\` | \`.method(Block, { pace })\`, \`.end({ demoPace })\`, or \`demo.pace\` in the config. |
| Stubs written inside Block files | Stubs in the flow. Blocks carry no narration. |
| \`new Engine()\` in every flow | \`import { engine } from "../../config/waygraph.config.js"\` (built from the loaded config). |
| Raw \`defineFlow([start, …, end])\` arrays | \`engine.map().start().gotoPage(…).method(…).end()\`, which checks each step's Block kind. |
| \`act(){}\` plus an \`observe\` that writes \`mem\` | Read into \`mem\` inside \`act\`. \`observe\` is only for a Block that branches. |
| \`NavBlockOptions.highlights\` | Prefer \`stubAfter\`. |
| \`package.json\` \`"waygraph": { "baseUrl" }\` | \`baseUrl\` in \`config/waygraph.config.ts\` (the field still works). |
| \`waygraph chain\` | \`waygraph run --blocks\` / \`waygraph demo --blocks\`. |
| \`--autoplay\` | \`--auto-next\`. |
| \`auto --cli --detach\` | \`waygraph pilot start\`. |
| \`create-waygraph\` (npm) | \`npx waygraph init\`. |

## Releases

\`0.15.49\` and \`0.15.50\` were published with local logs in the tarball and are deprecated on npm; use \`0.15.52\` or later.
`;
writeFileSync("docs/deprecated.md", md);
console.log(`docs/deprecated.md: ${found.length} deprecated API entries`);
