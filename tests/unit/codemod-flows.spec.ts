import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { convertFlows } from "../../src/commands/codemod-flows.js";

const KINDS: Record<string, string> = {
  NavHomeBlock: "nav",
  AddItemBlock: "effect",
  AssertHelloBlock: "assert",
  NavMailBlock: "nav",
  RawBlock: "block",
};

function run(flowSource: string): { text: string; problems: string[] } {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { module: 199, moduleResolution: 99 } });
  project.createSourceFile("/p/src/map/home/_nav.block.ts", "export const NavHomeBlock = {} as any;\nexport const RawBlock = {} as any;\n");
  project.createSourceFile("/p/src/map/home/_methods/add-item.effect.block.ts", "export const AddItemBlock = {} as any;\n");
  project.createSourceFile("/p/src/map/home/_methods/assert-hello.method.block.ts", "export const AssertHelloBlock = {} as any;\n");
  project.createSourceFile("/p/src/map/(external)/mail/_nav.block.ts", "export const NavMailBlock = {} as any;\n");
  project.createSourceFile("/p/config/waygraph.config.ts", "export const engine = {} as any;\n");
  const flow = project.createSourceFile("/p/src/flows/home/hello.flow.ts", flowSource);
  const { problems } = convertFlows(project, (_file, name) => KINDS[name]);
  return { text: flow.getFullText(), problems: problems.map((p) => p.reason) };
}

const IMPORTS = `import { NavHomeBlock } from "../../map/home/_nav.block.js";
import { AddItemBlock } from "../../map/home/_methods/add-item.effect.block.js";
import { AssertHelloBlock } from "../../map/home/_methods/assert-hello.method.block.js";
import { NavMailBlock } from "../../map/(external)/mail/_nav.block.js";
import { engine } from "../../../config/waygraph.config.js";
`;

describe("codemod flows", () => {
  it("turns defineFlow into a map() chain, picking each step by the Block's kind", () => {
    const { text, problems } = run(`import { start, end, withMemStub } from "waygraph";
${IMPORTS}
export const helloFlow = engine.defineFlow([start, NavHomeBlock, AddItemBlock, AssertHelloBlock, NavMailBlock, end], { title: "Hello", memStub: true });
`);
    assert.deepEqual(problems, []);
    assert.match(text, /engine\.map\(\{ memStub: true \}\)\s*\.start\(\)\s*\.gotoPage\(NavHomeBlock\.stubBefore\(\(ctx\) => \{\s*ctx\.title\("Hello"\);\s*\}\)\)\s*\.method\(AddItemBlock\)\s*\.assert\(AssertHelloBlock\)\s*\.gotoExternal\(NavMailBlock\)\s*\.end\(\)/);
    assert.doesNotMatch(text, /import \{[^}]*\b(start|end|withMemStub)\b[^}]*\} from "waygraph"/);
  });

  it("folds wrappers into map() settings and the title into the first step", () => {
    const { text } = run(`import { start, end, withTitle, withSessionReset, withExpectedFailure } from "waygraph";
${IMPORTS}
export const f = withTitle(withExpectedFailure(withSessionReset(engine.defineFlow([start, NavHomeBlock, end])), "blocked"), "Viewer");
`);
    assert.match(text, /engine\.map\(\{ sessionReset: true, expectedFailure: "blocked" \}\)/);
    assert.match(text, /\.gotoPage\(NavHomeBlock\.stubBefore\(\(ctx\) => \{\s*ctx\.title\("Viewer"\);\s*\}\)\)/);
    assert.doesNotMatch(text, /with(Title|SessionReset|ExpectedFailure)\(/);
  });

  it("nests chained and wrapped flow references with .flow()", () => {
    const { text } = run(`import { chainFlow, withMemStub } from "waygraph";
${IMPORTS}
import { a, b } from "./other.flow.js";
export const both = chainFlow(a, b);
export const stubbed = withMemStub(a);
`);
    assert.match(text, /both = engine\.map\(\)\s*\.start\(\)\s*\.flow\(a\)\s*\.flow\(b\)\s*\.end\(\)/);
    assert.match(text, /stubbed = engine\.map\(\{ memStub: true \}\)\s*\.start\(\)\s*\.flow\(a\)\s*\.end\(\)/);
  });

  it("chains stubs, moves .end(options) into map(), and reports what it can't convert", () => {
    const { text, problems } = run(`import { start, end, withStubBefore } from "waygraph";
${IMPORTS}
import { RawBlock } from "../../map/home/_nav.block.js";
export const x = withStubBefore(NavHomeBlock, (ctx) => ctx.title("x"));
export const y = engine.map().start().gotoPage(NavHomeBlock).end({ memStub: true });
export const z = engine.defineFlow([start, RawBlock, end]);
`);
    assert.match(text, /x = NavHomeBlock\.stubBefore\(\(ctx\) => ctx\.title\("x"\)\)/);
    assert.match(text, /y = engine\.map\(\{ memStub: true \}\)\.start\(\)\.gotoPage\(NavHomeBlock\)\.end\(\)/);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /RawBlock is not a Block from a define\*Block factory/);
    assert.match(text, /engine\.defineFlow\(\[start, RawBlock, end\]\)/);
  });
});
