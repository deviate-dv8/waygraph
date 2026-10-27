import { test, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkProject } from "../../src/analysis/check.js";

/** `waygraph check` warns when a Block that creates something requires a key whose mem stub never changes. */
test.describe("constant test data", () => {
  const dir = join(import.meta.dirname, ".tmp-constant-data");
  test.beforeAll(async () => {
    await mkdir(join(dir, "src/blocks"), { recursive: true });
    await mkdir(join(dir, "src/states"), { recursive: true });
    await writeFile(
      join(dir, "src/states/signup.keys.ts"),
      `import { key } from "waygraph";
export const SignupEmail = key<string>("signup.email");
export const FreshEmail = key<string>("signup.fresh-email");
export const Item = key<string>("cart.item");`,
    );
    await writeFile(
      join(dir, "src/states/signup.mem-stubs.ts"),
      `import { registerMemStub } from "waygraph";
import { FreshEmail, Item, SignupEmail } from "./signup.keys.js";
registerMemStub(SignupEmail, () => "qa@example.com");
registerMemStub(FreshEmail, ({ unique }) => \`qa+\${unique}@example.com\`);
registerMemStub(Item, () => "backpack");`,
    );
    const block = (exportName: string, name: string, key: string) => `
import { defineMethodBlock, checkpoint } from "waygraph";
import { ${key} } from "../states/signup.keys.js";
export const ${exportName} = defineMethodBlock({ name: "${name}", to: checkpoint("Done"), requires: [${key}], instruction: { async act() {} } });`;
    await writeFile(join(dir, "src/blocks/create-account.block.ts"), block("CreateAccountBlock", "create-account", "SignupEmail"));
    await writeFile(join(dir, "src/blocks/create-fresh.block.ts"), block("CreateFreshBlock", "create-fresh-account", "FreshEmail"));
    await writeFile(join(dir, "src/blocks/add-to-cart.block.ts"), block("AddToCartBlock", "add-to-cart", "Item"));
  });
  test.afterAll(() => rm(dir, { recursive: true, force: true }));

  test("only the create Block whose stub gives the same value twice", async () => {
    const { constantDataWarnings } = await checkProject(dir, { noPractices: true });
    expect(constantDataWarnings.map((w) => [w.blockName, w.key])).toEqual([["create-account", "signup.email"]]);
  });
});
