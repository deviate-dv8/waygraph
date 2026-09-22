import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  globToRegExp,
  isFileSelectToken,
  matchBlocksSelect,
  parseBlocksSelect,
} from "../../src/blocks-select.js";

describe("blocks-select (Phase C)", () => {
  it("classifies /regex/ vs glob vs bare", () => {
    assert.equal(isFileSelectToken("/mailpit/"), true);
    assert.equal(isFileSelectToken("**/mailpit/**/*.block.ts"), true);
    assert.equal(isFileSelectToken("shopFlow"), false);
    assert.equal(parseBlocksSelect("/auth|checkout/").kind, "regex");
    assert.equal(parseBlocksSelect("src/blocks/**/*.block.ts").kind, "glob");
    assert.equal(parseBlocksSelect("shopFlow").kind, "bare");
  });

  it("glob matches relative paths", () => {
    const sel = parseBlocksSelect("**/mailpit/**/*.block.ts");
    assert.equal(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/pia-external/mailpit/methods/open.block.ts",
      }),
      true,
    );
    assert.equal(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/pia-web/login/login.page.block.ts",
      }),
      false,
    );
  });

  it("regex matches path or block name", () => {
    const sel = parseBlocksSelect("/mailpit|PiaMailpit/");
    assert.equal(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/other/x.block.ts",
        blockName: "PiaMailpitGui",
      }),
      true,
    );
    assert.equal(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/pia-external/mailpit/nav.block.ts",
        blockName: "nav-x",
      }),
      true,
    );
    assert.equal(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/login/login.block.ts",
        blockName: "submit-login",
      }),
      false,
    );
  });

  it("globToRegExp handles * and **", () => {
    assert.equal(globToRegExp("a/*/b").test("a/x/b"), true);
    assert.equal(globToRegExp("a/*/b").test("a/x/y/b"), false);
    assert.equal(globToRegExp("a/**/b").test("a/x/y/b"), true);
  });
});
