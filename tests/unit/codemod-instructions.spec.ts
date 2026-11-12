import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codemodInstructions } from "../../src/cli/commands/codemod-instructions.js";

describe("--codemod instructions", () => {
  it("writes a Method's instruction flat, and folds observe and resolve into lands", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-instr-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src/a.method.block.ts"),
      [
        'import { defineMethodBlock, Trait } from "waygraph";',
        "export const Fill = defineMethodBlock({",
        '  name: "fill",',
        "  from: A,",
        "  to: A,",
        "  instruction: {",
        "    async act(page) {",
        '      await page.locator("input").fill("x");',
        "    },",
        '    verify: [Trait.visible("input")],',
        "  },",
        "});",
        "export const Submit = defineMethodBlock({",
        '  name: "submit",',
        "  from: A,",
        "  to: [B, A],",
        "  instruction: {",
        "    async act(page) {",
        '      await page.locator("button").click();',
        "    },",
        "    async observe(page): Promise<\"in\" | \"out\"> {",
        '      return (await page.locator(".err").count()) ? "out" : "in";',
        "    },",
        '    resolve: (seen) => (seen === "in" ? B : A),',
        "  },",
        "});",
        "",
      ].join("\n"),
    );
    try {
      const { changed, problems } = codemodInstructions(dir);
      assert.deepEqual(problems, []);
      assert.equal(changed.length, 1);
      const text = readFileSync(join(dir, "src/a.method.block.ts"), "utf8");
      assert.doesNotMatch(text, /instruction:/);
      assert.match(text, /\n {2}async act\(page\) \{\n {4}await page\.locator\("input"\)\.fill\("x"\);\n {2}\},/);
      assert.match(text, /\n {2}verify: \[Trait\.visible\("input"\)\],/);
      assert.match(text, /async lands\(page\) \{\n {4}const resolve = \(seen: "in" \| "out"\) => /);
      assert.match(text, /return resolve\(\(await page\.locator\("\.err"\)\.count\(\)\) \? "out" : "in"\);/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
