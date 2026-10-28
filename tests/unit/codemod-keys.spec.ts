import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codemodKeys } from "../../src/cli/commands/codemod-keys.js";

describe("codemod keys", () => {
  it("turns key() / keyGroup() into one namespace and rewrites every use, here and in importing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-codemod-keys-"));
    try {
      mkdirSync(join(dir, "src/states"), { recursive: true });
      mkdirSync(join(dir, "src/blocks"), { recursive: true });
      writeFileSync(
        join(dir, "src/states/shop.mem-keys.ts"),
        `import { key, keyGroup } from "waygraph";

/** Who signs in. */
export const Creds = keyGroup<{ username: string; password: string }>("shop.credentials");
export const Item = key<string>("shop.item");
`,
      );
      writeFileSync(
        join(dir, "src/blocks/login.block.ts"),
        `import { Creds, Item as SelectedItem } from "../states/shop.mem-keys.js";

export const requires = [Creds.key, SelectedItem];
export function seed(mem: { set(...a: unknown[]): void }) {
  mem.set(Creds({ username: "u", password: "p" }));
  mem.set(SelectedItem, "backpack");
}
export function local() {
  const A = key<string>("tmp.same");
  const B = key<string>("tmp.same");
  const Scoped = key<number>("scoped.count");
  return [A, B, Scoped];
}
`,
      );
      const { changed, problems } = codemodKeys(dir);
      assert.deepEqual(changed.sort(), ["src/blocks/login.block.ts", "src/states/shop.mem-keys.ts"]);
      const keysFile = readFileSync(join(dir, "src/states/shop.mem-keys.ts"), "utf8");
      assert.match(keysFile, /^import \{ keys \} from "waygraph";/);
      assert.match(keysFile, /export const ShopKeys = keys\("shop"\)<\{\n {2}\/\*\* Who signs in\. \*\/\n {2}credentials: \{ username: string; password: string \};\n {2}item: string;\n\}>\(\);/);
      const block = readFileSync(join(dir, "src/blocks/login.block.ts"), "utf8");
      assert.match(block, /import \{ ShopKeys \} from "..\/states\/shop.mem-keys.js";/);
      assert.match(block, /requires = \[ShopKeys.credentials, ShopKeys.item\]/);
      assert.match(block, /mem.set\(ShopKeys.credentials, \{ username: "u", password: "p" \}\)/);
      assert.match(block, /mem.set\(ShopKeys.item, "backpack"\)/);
      // a key declared inside a function gets its namespace there, in the file's indentation
      assert.match(block, /\n {2}const ScopedKeys = keys\("scoped"\)<\{\n {4}count: number;\n {2}\}>\(\);/);
      assert.match(block, /return \[A, B, ScopedKeys.count\]/);
      // two keys sharing one name in one block are two keys: left for a person
      assert.ok(problems.some((p) => p.includes('"tmp.same" names 2 different keys')));
      // a second run changes nothing
      assert.deepEqual(codemodKeys(dir).changed, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists a name that is not <namespace>.<field> instead of renaming it", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-codemod-keys-"));
    try {
      writeFileSync(join(dir, "a.ts"), `import { key } from "waygraph";\nexport const Email = key<string>("login-email");\n`);
      const { changed, problems } = codemodKeys(dir);
      assert.deepEqual(changed, []);
      assert.match(problems[0]!, /"login-email" is not "<namespace>.<field>"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
