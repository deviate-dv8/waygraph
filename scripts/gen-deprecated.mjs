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
const md = `# Deprecated and removed

0.16.0 removed every old form instead of keeping it alongside the new one, so there is one way to write each thing.
The two codemods in \`waygraph upgrade\` convert a project; the tables say what replaces what.

## Deprecated now (generated)

${found.length ? `| Name | Kind | Use instead |\n| --- | --- | --- |\n${rows}` : "Nothing in the API is deprecated. This list is generated from the `@deprecated` tags in the source."}

## Removed in 0.16.0: flows

\`waygraph upgrade --codemod flows\` rewrites these onto \`map()\` and lists anything it can't convert.

| Removed | Use instead |
| --- | --- |
| \`engine.defineFlow([start, …, end], options)\`, \`start\`, \`end\`, \`FlowOptions\` | \`engine.map({ … }).start().gotoPage(…).method(…).assert(…).end()\` |
| \`chainFlow(a, b)\` | \`engine.map().start().flow(a).flow(b, { reset: true }).end()\` |
| \`.end(options)\` | Settings in \`engine.map({ … })\` |
| \`withMemStub\`, \`withSessionReset\`, \`withExpectedFailure\`, \`withDemoPace\`, \`withHighlightStyle\` | \`engine.map({ memStub, sessionReset, expectedFailure, demoPace, highlightStyle })\` |
| \`withTitle(flow, title)\` | \`ctx.title(title)\` in a stub on the flow's first step |
| \`withBlockPace(block, pace)\` | The step option \`.method(Block, { pace })\` |
| \`withStubBefore\` / \`withStubAfter\` / \`withStubOnError\` | \`Block.stubBefore((ctx) => …)\` (and \`stubAfter\`, \`stubOnError\`) |
| \`withHighlightFixtures(flow, map)\`, \`HighlightFixtureMap\`, \`WaygraphHighlightFixture\` | ctx stubs chained on the Block where the flow uses it: \`AddItemBlock.stubAfter((ctx) => { ctx.ring(…) })\` |

## Removed in 0.16.0: Blocks and Checkpoints

\`waygraph upgrade --codemod checkpoints\` rewrites tag strings and \`<In, Out>\` into Checkpoint values.

| Removed | Use instead |
| --- | --- |
| \`checkpoint: "Home"\` (a tag string) on Nav, NavClick, Page and Assert Blocks; \`from: ["Home"]\` on a Nav | \`checkpoint: Home\`, \`from: [Home]\`, with \`export const Home = checkpoint("Home")\` |
| \`defineMethodBlock<In, Out>({ … })\` / \`defineEffectBlock<In, Out>({ … })\` | \`defineMethodBlock({ from: In, to: Out, … })\` (leave \`from\` out for "from anywhere") |
| \`defineApiBlock\` without \`to\` | \`defineApiBlock({ to: Out, … })\` |
| \`defineActionBlock\`, \`ActionBlock\` | \`defineMethodBlock\`, \`MethodBlock\` |
| \`defineMemEffectBlock\`, \`MemEffectBlock\` | \`defineEffectBlock\`, \`EffectBlock\` |
| \`highlights: [...]\` on an instruction, a Nav or a Page Block; \`WaygraphHighlight\` | \`.stubAfter((ctx) => { ctx.ring(…) })\` |
| A stub written as \`(out) => ({ slot: … })\`, and per-slot \`todos\` | \`(ctx) => { ctx.ring(…); ctx.todos(…) }\` |
| \`ctx.todos([...])\` with \`ctx.todoId\` / \`todoTitle\` / \`todoStyle\` / \`todoPos\` | \`ctx.todos(id, items, { title, style, pos, index })\` (codemod \`flows\`) |
| \`ctx.todoGroups(groups)\` | \`ctx.todoGroups(id, groups, { title, style, pos })\` |
| \`ctx.banner\`, \`ctx.bannerPos\`, \`ctx.clearDevice\`, \`ctx.clearTodos\` | \`ctx.title\`, \`ctx.titlePos\`, \`ctx.hideDevice\`, \`ctx.hideTodos\` |
| \`ctx.landscape()\` / \`ctx.portrait()\`, \`ctx.todoDockFull()\` | \`ctx.orientation("landscape" \| "portrait")\`, \`ctx.todoDockUi({ compact: false, collision: false, behindRing: false })\` |
| \`ctx.set({...})\`, a todo item's \`name\` | One call per thing (\`ctx.ring\`, \`ctx.todos\`, …); \`id\` |
| \`WAYGRAPH_STEPPER_MINI\` | \`WAYGRAPH_MINI\` (\`--mini\`) |
| \`--no-todo-smart\` | \`--todo-full\` |
| \`resolveSlideDwellMs\`, \`SLIDE_DURATION_MS_DEFAULT\`, \`SLIDE_DURATION_FAST_MS_DEFAULT\` | \`resolveFixtureDwellMs\`, \`FIXTURE_DURATION_MS_DEFAULT\`, \`FIXTURE_DURATION_FAST_MS_DEFAULT\` |

## Removed in 0.16.0: project and CLI

| Removed | Use instead |
| --- | --- |
| A project's own \`playwright.config.ts\` | \`config/waygraph.config.ts\` (\`testDir\`, \`webServer\`, \`playwright: { … }\`); \`waygraph upgrade\` points one out |
| \`package.json\` \`"waygraph": { "baseUrl" }\` | \`baseUrl\` in \`config/waygraph.config.ts\` |
| \`waygraph chain <spec>\`, \`chain auto A B\` | \`waygraph run --blocks <spec>\` / \`demo --blocks\`, \`auto --blocks A B\` |
| \`waygraph auto --cli --detach\` | \`waygraph browser start [--headless] [--goto <url>]\`, or \`pilot start\` |
| \`--autoplay\` / \`--no-autoplay\`, \`--stepper-mini\`, \`--no-ff\`, \`try auto --headed\` | \`--auto-next\` / \`--no-auto-next\`, \`--mini\`, \`--ff-disabled\`, \`try auto\` |
| \`WAYGRAPH_TODO_UI=legacy\` / \`classic\` | \`WAYGRAPH_TODO_UI=full\` |
| \`create-waygraph\` (npm) | \`npx waygraph init\` |

## Style

Not API, but the convention the tools and docs assume.

| Instead of | Write |
| --- | --- |
| Stubs written inside Block files | Stubs in the flow. Blocks carry no narration. |
| \`new Engine()\` in every flow | \`import { engine } from "../../config/waygraph.config.js"\` (built from the loaded config). |
| \`act(){}\` plus an \`observe\` that writes \`mem\` | Read into \`mem\` inside \`act\`. \`observe\` is only for a Block that branches. |

## Releases

\`0.15.49\` and \`0.15.50\` were published with local logs in the tarball and are deprecated on npm; use \`0.15.52\` or later.
`;
writeFileSync("docs/deprecated.md", md);
console.log(`docs/deprecated.md: ${found.length} deprecated API entries`);
