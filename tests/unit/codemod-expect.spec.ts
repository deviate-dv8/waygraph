import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertExpectations } from "../../src/cli/commands/codemod-expect.js";

describe("--codemod expect", () => {
  it("folds .assert() and .expect() steps into the expect list of the step before them", () => {
    const before = [
      'import { defineAssertBlock, Trait, type AssertBlock } from "waygraph";',
      "export const A = defineAssertBlock({ name: 'a', checkpoint: X, verify: [Trait.read(K.rows, (r) => r.length > 0, 'rows')] });",
      "export const f = map()",
      "  .gotoPage(NavBlock)",
      "  .assert(AssertHeaderBlock)",
      "  .method(SaveBlock, { lands: Detail })",
      "  .assert(tick(AssertSavedBlock, 1))",
      "  .expect(Machine.status, \"Archived\")",
      "  .expect(Machine.rows, (rows, mem) => rows.length > 1, \"two rows\")",
      "  .method(Other, { pace: 'fast', expect: [Existing] })",
      "  .assert(Second);",
      "",
    ].join("\n");
    const { text, left } = convertExpectations(before);
    assert.deepEqual(left, []);
    assert.match(text, /import \{ defineExpectBlock, Trait, type ExpectBlock \} from "waygraph";/);
    assert.match(text, /defineExpectBlock\(\{ name: 'a', checkpoint: X, verify: \[K\.rows\.passes\(\(r\) => r\.length > 0, 'rows'\)\] \}\)/);
    assert.match(text, /\.gotoPage\(NavBlock, \{ expect: \[AssertHeaderBlock\] \}\)/);
    assert.match(
      text,
      /\.method\(SaveBlock, \{ lands: Detail, expect: \[tick\(AssertSavedBlock, 1\), Machine\.status\.is\("Archived"\), Machine\.rows\.passes\(\(rows, mem\) => rows\.length > 1, "two rows"\)\] \}\)/,
    );
    assert.match(text, /\.method\(Other, \{ pace: 'fast', expect: \[Existing, Second\] \}\);/);
    assert.doesNotMatch(text, /\.assert\(|\.expect\(/);
    // Each step keeps its own line.
    assert.match(text, /\n  \.gotoPage\(NavBlock, \{ expect: \[AssertHeaderBlock\] \}\)\n  \.method\(SaveBlock/);
  });

  it("lists what it can't place: an assert with no step before it, a Layout", () => {
    const { left } = convertExpectations("map().steps(signIn).assert(Home);\nexport const L = defineLayout({ name: 'shell' });\n");
    assert.equal(left.length, 2);
    assert.match(left[0]?.reason ?? "", /\.assert\(\) after \.steps\(\)/);
    assert.match(left[1]?.reason ?? "", /a Layout/);
  });

  it("leaves a test runner's expect() alone", () => {
    const src = "expect(await flow.run(context, mem)).toEqual(Done);\nexpect.poll(() => 1).toBe(1);\n";
    assert.equal(convertExpectations(src).text, src);
  });
});
