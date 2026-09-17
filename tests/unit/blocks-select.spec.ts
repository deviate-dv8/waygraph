import { describe, expect, it } from "vitest";
import {
  globToRegExp,
  isFileSelectToken,
  matchBlocksSelect,
  parseBlocksSelect,
} from "../../src/blocks-select.js";

describe("blocks-select (Phase C)", () => {
  it("classifies /regex/ vs glob vs bare", () => {
    expect(isFileSelectToken("/mailpit/")).toBe(true);
    expect(isFileSelectToken("**/mailpit/**/*.block.ts")).toBe(true);
    expect(isFileSelectToken("shopFlow")).toBe(false);
    expect(parseBlocksSelect("/auth|checkout/").kind).toBe("regex");
    expect(parseBlocksSelect("src/blocks/**/*.block.ts").kind).toBe("glob");
    expect(parseBlocksSelect("shopFlow").kind).toBe("bare");
  });

  it("glob matches relative paths", () => {
    const sel = parseBlocksSelect("**/mailpit/**/*.block.ts");
    expect(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/pia-external/mailpit/methods/open.block.ts",
      }),
    ).toBe(true);
    expect(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/pia-web/login/login.page.block.ts",
      }),
    ).toBe(false);
  });

  it("regex matches path or block name", () => {
    const sel = parseBlocksSelect("/mailpit|PiaMailpit/");
    expect(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/other/x.block.ts",
        blockName: "PiaMailpitGui",
      }),
    ).toBe(true);
    expect(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/pia-external/mailpit/nav.block.ts",
        blockName: "nav-x",
      }),
    ).toBe(true);
    expect(
      matchBlocksSelect(sel, {
        relFile: "src/blocks/login/login.block.ts",
        blockName: "submit-login",
      }),
    ).toBe(false);
  });

  it("globToRegExp handles * and **", () => {
    expect(globToRegExp("a/*/b").test("a/x/b")).toBe(true);
    expect(globToRegExp("a/*/b").test("a/x/y/b")).toBe(false);
    expect(globToRegExp("a/**/b").test("a/x/y/b")).toBe(true);
  });
});
