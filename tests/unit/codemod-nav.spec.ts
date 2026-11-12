import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codemodNav } from "../../src/cli/commands/codemod-nav.js";

describe("--codemod nav", () => {
  it("folds a page's Nav into the page, and Page.nav becomes Page", () => {
    const dir = mkdtempSync(join(tmpdir(), "wg-nav-"));
    mkdirSync(join(dir, "src"));
    const files: Record<string, string> = {
      "src/nav.block.ts": [
        'import { defineNavBlock, Trait } from "waygraph";',
        'import { HomeCp, SIGNED_IN } from "./states.js";',
        'import { HomeSel } from "./sel.js";',
        "export const NavHomeBlock = defineNavBlock({",
        '  name: "nav-home",',
        "  checkpoint: HomeCp,",
        '  url: "/home",',
        "  from: SIGNED_IN,",
        "  verify: [Trait.visible(HomeSel.title)],",
        "});",
        "",
      ].join("\n"),
      "src/page.block.ts": [
        'import { definePageBlock, Trait } from "waygraph";',
        'import { HomeCp } from "./states.js";',
        'import { NavHomeBlock } from "./nav.block.js";',
        "export const HomePage = definePageBlock({",
        '  name: "page-home",',
        "  checkpoint: HomeCp,",
        "  nav: NavHomeBlock,",
        '  verify: [Trait.url({ pathname: "/home" })],',
        "});",
        "",
      ].join("\n"),
      "src/flow.ts": 'import { HomePage } from "./page.block.js";\nexport const flow = map().gotoPage(HomePage.nav).method(HomePage.do.x);\n',
    };
    files["src/states.ts"] = "export const HomeCp = 1;\nexport const SIGNED_IN = [1];\n";
    files["src/sel.ts"] = 'export const HomeSel = { title: "h1" };\n';
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    try {
      const { problems } = codemodNav(dir);
      assert.deepEqual(problems, []);
      const page = readFileSync(join(dir, "src/page.block.ts"), "utf8");
      assert.match(page, /url: "\/home"/);
      assert.match(page, /from: SIGNED_IN/);
      assert.match(page, /verify: \[Trait\.visible\(HomeSel\.title\), Trait\.url\(\{ pathname: "\/home" \}\)\]/);
      assert.match(page, /import \{ HomeSel \} from "\.\/sel\.js"/);
      assert.match(page, /import \{ HomeCp, SIGNED_IN \} from "\.\/states\.js"/);
      assert.doesNotMatch(page, /nav:|NavHomeBlock/);
      assert.equal(existsSync(join(dir, "src/nav.block.ts")), false);
      assert.match(readFileSync(join(dir, "src/flow.ts"), "utf8"), /gotoPage\(HomePage\)\.method/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
