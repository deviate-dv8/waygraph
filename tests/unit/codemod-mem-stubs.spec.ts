import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codemodMemStubs } from "../../src/cli/commands/codemod-mem-stubs.js";

describe("--codemod mem-stubs", () => {
  it("moves a registered stub onto its key, and removes the file it leaves empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-stubs-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/keys.ts"), 'import { keys } from "waygraph";\nexport const ShopKeys = keys("shop")<{ item: { id: string }; email: string }>();\n');
    writeFileSync(
      join(dir, "src/shop.mem-stubs.ts"),
      'import { registerMemStub } from "waygraph";\nimport { ShopKeys } from "./keys.js";\nregisterMemStub(ShopKeys.item, () => ({ id: "backpack" }));\nregisterMemStub(ShopKeys.email, ({ unique }) => `qa+${unique}@example.com`);\n',
    );
    try {
      const { changed, problems } = codemodMemStubs(dir);
      assert.deepEqual(problems, []);
      assert.equal(changed.length, 2);
      const keys = readFileSync(join(dir, "src/keys.ts"), "utf8");
      assert.match(keys, /keys\("shop"\)<\{ item: \{ id: string \}; email: string \}>\(\{/);
      assert.match(keys, /item: \(\) => \(\{ id: "backpack" \}\)/);
      assert.match(keys, /email: \(\{ unique \}\) => `qa\+\$\{unique\}@example\.com`/);
      assert.equal(existsSync(join(dir, "src/shop.mem-stubs.ts")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
