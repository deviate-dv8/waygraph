import { test, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkProject } from "../../src/analysis/check.js";

/**
 * `waygraph check` warns when a Block that creates something requires a key whose mem stub never changes, and none of
 * its keys is new every run: what it makes would be made twice. A sign-in token next to a name from `unique` is fine,
 * and an API call that reads (GET) or changes what's there (PATCH) makes nothing new.
 */
test.describe("constant test data", () => {
  const dir = join(import.meta.dirname, ".tmp-constant-data");
  test.beforeAll(async () => {
    await mkdir(join(dir, "src/blocks"), { recursive: true });
    await mkdir(join(dir, "src/states"), { recursive: true });
    await writeFile(
      join(dir, "src/states/signup.keys.ts"),
      `import { keys } from "waygraph";
export const { email: SignupEmail, freshEmail: FreshEmail } = keys("signup")<{ email: string; freshEmail: string }>();
export const { item: Item } = keys("cart")<{ item: string }>();
export const { token: Token, lineName: LineName } = keys("api")<{ token: string; lineName: string }>();`,
    );
    await writeFile(
      join(dir, "src/states/signup.mem-stubs.ts"),
      `import { registerMemStub } from "waygraph";
import { FreshEmail, Item, LineName, SignupEmail, Token } from "./signup.keys.js";
registerMemStub(SignupEmail, () => "qa@example.com");
registerMemStub(FreshEmail, ({ unique }) => \`qa+\${unique}@example.com\`);
registerMemStub(Item, () => "backpack");
registerMemStub(Token, () => "session-token");
registerMemStub(LineName, ({ unique }) => \`Line \${unique}\`);`,
    );
    const block = (exportName: string, name: string, key: string) => `
import { defineMethodBlock, checkpoint } from "waygraph";
import { ${key} } from "../states/signup.keys.js";
export const ${exportName} = defineMethodBlock({ name: "${name}", to: checkpoint("Done"), requires: [${key}], instruction: { async act() {} } });`;
    await writeFile(join(dir, "src/blocks/create-account.block.ts"), block("CreateAccountBlock", "create-account", "SignupEmail"));
    await writeFile(join(dir, "src/blocks/create-fresh.block.ts"), block("CreateFreshBlock", "create-fresh-account", "FreshEmail"));
    await writeFile(join(dir, "src/blocks/add-to-cart.block.ts"), block("AddToCartBlock", "add-to-cart", "Item"));
    const api = (exportName: string, name: string, method: string, keys: string[]) => `
import { defineApiBlock, checkpoint } from "waygraph";
import { ${keys.join(", ")} } from "../states/signup.keys.js";
export const ${exportName} = defineApiBlock({ name: "${name}", to: checkpoint("Done"), method: "${method}", requires: [${keys.join(", ")}], call: ({ request }) => request.get("/") });`;
    await writeFile(join(dir, "src/blocks/find-area.api.block.ts"), api("FindAreaBlock", "find-area", "GET", ["Token"]));
    await writeFile(join(dir, "src/blocks/make-line.api.block.ts"), api("MakeLineBlock", "make-line", "POST", ["Token", "LineName"]));
    await writeFile(join(dir, "src/blocks/make-thing.api.block.ts"), api("MakeThingBlock", "make-thing", "POST", ["Token"]));
    await writeFile(join(dir, "src/blocks/lower-capacity.api.block.ts"), api("LowerCapacityBlock", "lower-capacity", "PATCH", ["Token"]));
  });
  test.afterAll(() => rm(dir, { recursive: true, force: true }));

  test("only a create Block with no key that's new every run, and not a call that only reads", async () => {
    const { constantDataWarnings } = await checkProject(dir, { noPractices: true });
    expect(constantDataWarnings.map((w) => [w.blockName, w.key]).sort()).toEqual([
      ["create-account", "signup.email"],
      ["make-thing", "api.token"],
    ]);
  });
});
