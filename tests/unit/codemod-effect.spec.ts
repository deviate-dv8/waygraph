import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codemodEffect, convertEffect } from "../../src/cli/commands/codemod-effect.js";

describe("--codemod effect", () => {
  it("makes an Effect Block a Method, its rows and all, and imports each name once", () => {
    const before = [
      'import { defineEffectBlock, defineMethodBlock, type EffectBlock, type MethodBlock } from "waygraph";',
      "export const Add: EffectBlock<Home, Cart> = defineEffectBlock({",
      "  name: 'add-item',",
      "  to: Cart,",
      "  requires: [Keys.item],",
      "  instruction: { async act() {} },",
      "  async instanceOptions() { return []; },",
      "});",
      "",
    ].join("\n");
    const { text, left } = convertEffect(before);
    assert.deepEqual(left, []);
    assert.match(text, /^import \{ defineMethodBlock, type MethodBlock \} from "waygraph";/);
    assert.match(text, /export const Add: MethodBlock<Home, Cart> = defineMethodBlock\(\{/);
    // The rows stay: a Method lists them the same way.
    assert.match(text, /requires: \[Keys\.item\],\n  instruction: \{ async act\(\) \{\} \},\n  async instanceOptions\(\)/);
  });

  it("lists EffectExtras for a person", () => {
    const { left } = convertEffect('import type { EffectExtras } from "waygraph";\ntype X = EffectExtras<A, B>;\n');
    assert.equal(left.length, 2);
    assert.match(left[0]?.reason ?? "", /requires \/ instanceOptions/);
  });

  it("renames each .effect.block.ts to .method.block.ts, and the imports that name it", () => {
    const dir = mkdtempSync(join(tmpdir(), "codemod-effect-"));
    try {
      mkdirSync(join(dir, "src", "methods"), { recursive: true });
      writeFileSync(join(dir, "src", "methods", "add.effect.block.ts"), 'import { defineEffectBlock } from "waygraph";\nexport const Add = defineEffectBlock({} as never);\n');
      writeFileSync(join(dir, "src", "page.block.ts"), 'import { Add } from "./methods/add.effect.block.js";\nimport { Other } from "./other.effect.block.js";\n');
      const { changed, problems } = codemodEffect(dir);
      assert.deepEqual(problems, []);
      assert.deepEqual(changed.sort(), [join("src", "methods", "add.method.block.ts"), join("src", "page.block.ts")]);
      assert.equal(existsSync(join(dir, "src", "methods", "add.effect.block.ts")), false);
      assert.match(readFileSync(join(dir, "src", "methods", "add.method.block.ts"), "utf8"), /defineMethodBlock\(/);
      // Only imports of files it renamed change.
      assert.equal(
        readFileSync(join(dir, "src", "page.block.ts"), "utf8"),
        'import { Add } from "./methods/add.method.block.js";\nimport { Other } from "./other.effect.block.js";\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
