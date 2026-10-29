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
| \`withTitle(flow, title)\` | \`ctx.ui.title(title)\` in a stub on the flow's first step |
| \`withBlockPace(block, pace)\` | The step option \`.method(Block, { pace })\` |
| \`withStubBefore\` / \`withStubAfter\` / \`withStubOnError\` | \`Block.stubBefore((ctx) => …)\` (and \`stubAfter\`, \`stubOnError\`) |
| \`withHighlightFixtures(flow, map)\`, \`HighlightFixtureMap\`, \`WaygraphHighlightFixture\` | ctx stubs chained on the Block where the flow uses it: \`AddItemBlock.stubAfter((ctx) => { ctx.ui.ring(…) })\` |

## Removed in 0.16.0: Blocks and Checkpoints

\`waygraph upgrade --codemod checkpoints\` rewrites tag strings and \`<In, Out>\` into Checkpoint values.

| Removed | Use instead |
| --- | --- |
| \`checkpoint: "Home"\` (a tag string) on Nav, NavClick, Page and Assert Blocks; \`from: ["Home"]\` on a Nav | \`checkpoint: Home\`, \`from: [Home]\`, with \`export const Home = checkpoint("Home")\` |
| \`defineMethodBlock<In, Out>({ … })\` / \`defineEffectBlock<In, Out>({ … })\` | \`defineMethodBlock({ from: In, to: Out, … })\` (leave \`from\` out for "from anywhere") |
| \`defineApiBlock\` without \`to\` | \`defineApiBlock({ to: Out, … })\` |
| \`defineActionBlock\`, \`ActionBlock\` | \`defineMethodBlock\`, \`MethodBlock\` |
| \`defineMemEffectBlock\`, \`MemEffectBlock\` | \`defineEffectBlock\`, \`EffectBlock\` |
| \`highlights: [...]\` on an instruction, a Nav or a Page Block; \`WaygraphHighlight\` | \`.stubAfter((ctx) => { ctx.ui.ring(…) })\` |
| A stub written as \`(out) => ({ slot: … })\`, and per-slot \`todos\` | \`(ctx) => { ctx.ui.ring(…); ctx.ui.todos(…) }\` |
| \`ctx.todos([...])\` with \`ctx.todoId\` / \`todoTitle\` / \`todoStyle\` / \`todoPos\` | \`ctx.ui.todos(id, items, { title, style, pos, index })\` (codemod \`flows\`) |
| \`ctx.todoGroups(groups)\` | \`ctx.ui.todoGroups(id, groups, { title, style, pos })\` |
| \`ctx.banner\`, \`ctx.bannerPos\`, \`ctx.clearDevice\`, \`ctx.clearTodos\` | \`ctx.ui.title\`, \`ctx.ui.titlePos\`, \`ctx.ui.hideDevice\`, \`ctx.ui.hideTodos\` |
| \`ctx.landscape()\` / \`ctx.portrait()\`, \`ctx.todoDockFull()\` | \`ctx.ui.orientation("landscape" \| "portrait")\`, \`ctx.ui.todoDockUi({ compact: false, collision: false, behindRing: false })\` |
| A stub in a Block's definition (\`defineXBlock({ stubBefore })\` or its \`instruction\`) | \`Block.stubBefore((ctx) => …)\` where the flow uses it (codemod \`flows\`) |
| A slot map as a stub (\`.stubAfter({ email: { selector, label } })\`), \`HighlightStubPhaseOrFn\` | \`.stubAfter((ctx) => { ctx.ui.ring("email", { selector, label }) })\` (codemod \`flows\`) |
| \`ctx.set({...})\`, a todo item's \`name\` | One call per thing (\`ctx.ui.ring\`, \`ctx.ui.todos\`, …); \`id\` |
| \`WAYGRAPH_STEPPER_MINI\` | \`WAYGRAPH_MINI\` (\`--mini\`) |
| \`--no-todo-smart\` | \`--todo-full\` |
| \`traverse --headed\`, \`inject veciro\` / \`demosauce\` | \`traverse --non-headless\`, \`--inject <path>\` / \`--inject saucedemo\` |
| \`resolveSlideDwellMs\`, \`SLIDE_DURATION_MS_DEFAULT\`, \`SLIDE_DURATION_FAST_MS_DEFAULT\` | \`resolveFixtureDwellMs\`, \`FIXTURE_DURATION_MS_DEFAULT\`, \`FIXTURE_DURATION_FAST_MS_DEFAULT\` |

## Removed in 0.16.9: other spellings of the same value

A narration option takes its documented values only; anything else stops the step with the values it takes.

| Removed | Use instead |
| --- | --- |
| tone \`error\` / \`red\`, \`warn\` / \`yellow\`, \`ok\` / \`green\`, \`blue\`, \`amber\` / \`dom\` / \`inspect\`, \`purple\` / \`authored\`, \`automation\` / \`engine\` | \`danger\`, \`warning\`, \`success\`, \`info\`, \`orange\`, \`planned\`, \`auto\` |
| size \`s\` / \`small\` / \`tiny\`, \`l\` / \`large\` / \`big\` / \`xl\`; weight \`strong\` / \`heavy\` / \`b\` | \`sm\`, \`lg\`; \`bold\` |
| device \`phone\` / \`m\`, \`pad\` / \`t\`, \`desk\` / \`d\` / \`main\`; orientation \`port\` / \`tall\` / \`p\`, \`land\` / \`wide\` / \`l\` | \`mobile\`, \`tablet\`, \`desktop\`; \`portrait\`, \`landscape\` |
| pace \`ff\`, \`quick\`, \`careful\` / \`review\`, \`default\` / \`1x\`, \`2x\` | \`blitz\`, \`fast\`, \`slow\`, \`normal\`, \`2\` |
| todo style \`seq\` / \`steps\`, \`check\` / \`box\`, \`bullet\` / \`list\` / \`ul\` / \`plain\`; dock side \`l\` / \`r\` | \`sequential\`, \`checklist\`, \`bullets\`; \`left\`, \`right\` |
| Upper case or spaces around a value (\`"Danger "\`) | the value as written above |
| \`WAYGRAPH_AUTO_MEM\` | \`WAYGRAPH_DATA\` (\`--data\`) |

## Removed in 0.16.9: the hand-written glob matcher

\`--blocks\` globs are matched by picomatch now (\`**\`, \`*\`, \`?\`, \`{a,b}\`, \`[abc]\`).

| Removed | Use instead |
| --- | --- |
| \`globToRegExp(glob)\` | \`matchBlocksSelect(parseBlocksSelect(glob), { relFile })\`, or picomatch itself |

## Removed in 0.16.7: the beta entry

Read Blocks are part of \`waygraph\` now.

| Removed | Use instead |
| --- | --- |
| \`import { defineReadBlock, reads, ReadPage, readCheckpoint } from "waygraph/beta"\` | the same names from \`"waygraph"\` |

## Removed in 0.16.7: one key per declaration

\`waygraph upgrade --codemod keys\` rewrites them into namespaces and updates every use.

| Removed | Use instead |
| --- | --- |
| \`const Creds = key<Creds>("saucedemo.credentials")\` | \`const SaucedemoKeys = keys("saucedemo")<{ credentials: Creds }>()\`, used as \`SaucedemoKeys.credentials\` |
| \`keyGroup<T>(name)\`, \`Creds.key\`, \`mem.set(Creds({ ... }))\` | a namespace field: \`mem.set(SaucedemoKeys.credentials, { ... })\` |

## Removed in 0.16.6: the overlay's CSS in code

The overlay's look is one stylesheet now (Tailwind, macOS tokens), not CSS strings exported from code.

| Removed | Use instead |
| --- | --- |
| \`WAYGRAPH_RING_CSS\` | Nothing: every surface that paints a ring installs the overlay's stylesheet, ring included. A tone is \`ctx.ui.ring(…, { tone })\`. |

## Removed in 0.16.3: painting straight on a stub's ctx

A stub paints through \`ctx.ui\`; \`ctx\` itself holds only what a stub reads (\`mem\`, \`out\`, \`error\`). \`waygraph upgrade --codemod flows\` moves every call.

| Removed | Use instead |
| --- | --- |
| \`ctx.ring(…)\`, \`ctx.todos(…)\`, \`ctx.title(…)\`, \`ctx.caption(…)\`, \`ctx.device(…)\`, \`ctx.zoom(…)\`, \`ctx.slides(…)\`, \`ctx.showNetworkTab()\`, … (every painting call) | \`ctx.ui.ring(…)\`, \`ctx.ui.todos(…)\`, \`ctx.ui.title(…)\`, … |

## Removed in 0.16.2: narration in a Block

\`waygraph upgrade --codemod flows\` moves a Block's \`slides\` into \`ctx.ui.slides\` in its chained \`stubAfter\`, turns \`ctx.highlights\` into \`ctx.ring\` calls, and unwraps \`narrate\` (it lists each caption to move).

| Removed | Use instead |
| --- | --- |
| \`slides: [...]\` on an instruction or \`defineAssertBlock\`, \`WaygraphSlidesOrFn\` | \`Block.stubAfter((ctx) => ctx.ui.slides([...]))\` where the flow uses it (or \`stubBefore\` to play them before the step) |
| \`slides: (out) => [...]\` | \`.stubAfter((ctx) => ctx.ui.slides(…ctx.out…))\` |
| \`resolveSlides(block)\` | \`(await runStubPhase(block, "stubAfter", { out })).slides\` |
| \`narrate(locator, caption, () => action)\` in an \`act\` | The action alone in \`act\`, and \`Block.stubBefore((ctx) => ctx.ui.ring("id", { selector, label: caption }))\` where the flow uses it (a click or fill on that element shows the ring) |
| \`ctx.highlights({ a: ring, b: ring })\` | \`ctx.ui.ring("a", ring); ctx.ui.ring("b", ring);\` |

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
