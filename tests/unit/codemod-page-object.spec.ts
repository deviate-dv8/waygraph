import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codemodPageObject } from "../../src/cli/commands/codemod-page-object.js";

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "wg-po-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

describe("--codemod page-object", () => {
  it("folds a page's Read Block and namespace into its read, and rewrites the uses", () => {
    const dir = project({
      "src/reads.ts": 'import { reads } from "waygraph";\nexport const Basket = reads("basket")<{ count: number }>();\n',
      "src/basket.page.block.ts": [
        'import { definePageBlock } from "waygraph";',
        'import { BasketCp } from "./states.js";',
        'import { EmptyBlock } from "./empty.method.block.js";',
        "export const BasketPage = definePageBlock({",
        '  name: "page-basket",',
        "  checkpoint: BasketCp,",
        "  methods: { empty: () => EmptyBlock },",
        "});",
        "",
      ].join("\n"),
      "src/basket.read.block.ts": [
        'import { defineReadBlock } from "waygraph";',
        'import { BasketCp } from "./states.js";',
        'import { Basket } from "./reads.js";',
        "export const BasketReadBlock = defineReadBlock({",
        '  name: "read-basket",',
        "  from: BasketCp,",
        '  instruction: { read: (ctx) => Basket({ count: ctx.page.number(".count") }) },',
        "});",
        "",
      ].join("\n"),
      "src/empty.method.block.ts": [
        'import { defineMethodBlock } from "waygraph";',
        'import { BasketCp } from "./states.js";',
        'import { Basket } from "./reads.js";',
        'export const EmptyBlock = defineMethodBlock({ name: "empty", from: BasketCp, to: BasketCp, instruction: { async act() {}, verify: [Basket.count.is(0)] } });',
        "",
      ].join("\n"),
      "src/flow.ts": 'import { Basket } from "./reads.js";\nexport const check = Basket.count.is(2);\n',
    });
    try {
      const { changed, problems } = codemodPageObject(dir);
      assert.deepEqual(problems, []);
      const page = readFileSync(join(dir, "src/basket.page.block.ts"), "utf8");
      assert.match(page, /do: \(\) => \(\{ empty: EmptyBlock \}\)/);
      assert.match(page, /read: \(ctx\) => \(\{\s+count: ctx\.page\.number\("\.count"\)/);
      assert.match(page, /readAs: "basket"/);
      assert.equal(existsSync(join(dir, "src/basket.read.block.ts")), false);
      // The method is one the page imports: its check becomes a function, called when it runs.
      const method = readFileSync(join(dir, "src/empty.method.block.ts"), "utf8");
      assert.match(method, /verify: \(\): Trait\[\] => \[BasketPage\.read\.count\.is\(0\)\]/);
      assert.match(readFileSync(join(dir, "src/flow.ts"), "utf8"), /BasketPage\.read\.count\.is\(2\)/);
      assert.equal(existsSync(join(dir, "src/reads.ts")) && readFileSync(join(dir, "src/reads.ts"), "utf8").includes("reads("), false);
      assert.ok(changed.length >= 4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("makes a Page Block of a Read Block whose Checkpoint has none, and lists what it can't place", () => {
    const dir = project({
      "src/reads.ts": 'import { reads } from "waygraph";\nexport const Inbox = reads("inbox")<{ unread: number }>();\nexport const Every = reads("every")<{ title: string }>();\n',
      "src/inbox.read.block.ts": [
        'import { defineReadBlock } from "waygraph";',
        'import { InboxCp } from "./states.js";',
        'import { Inbox } from "./reads.js";',
        "export const InboxReadBlock = defineReadBlock({",
        '  name: "read-inbox",',
        '  description: "How many are unread.",',
        "  from: InboxCp,",
        '  instruction: { read: (ctx) => Inbox({ unread: ctx.page.number(".unread") }) },',
        "});",
        "",
      ].join("\n"),
      "src/every.read.block.ts": 'import { defineReadBlock } from "waygraph";\nimport { Every } from "./reads.js";\nexport const EveryRead = defineReadBlock({ name: "read-every", instruction: { read: (ctx) => Every({ title: ctx.page.text("h1") }) } });\n',
    });
    try {
      const { problems } = codemodPageObject(dir);
      assert.equal(problems.length, 1);
      assert.match(problems[0] ?? "", /every\.read\.block\.ts: .*reads every page/);
      const page = readFileSync(join(dir, "src/inbox.page.block.ts"), "utf8");
      assert.match(page, /export const InboxPage = definePageBlock\(/);
      assert.match(page, /name: "page-inbox"/);
      assert.match(page, /checkpoint: InboxCp/);
      assert.match(page, /readAs: "inbox"/);
      assert.equal(existsSync(join(dir, "src/inbox.read.block.ts")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
