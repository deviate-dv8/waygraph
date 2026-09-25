import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHighlightShorthand } from "../../src/highlight-shorthand.js";

describe("parseHighlightShorthand", () => {
  it("parses a single ring with selector + label", () => {
    const r = parseHighlightShorthand("#submit|Login button");
    assert.equal(r.type, "ok");
    if (r.type !== "ok") return;
    assert.deepEqual(r.fixtures.rings, [{ selector: "#submit", label: "Login button" }]);
  });

  it("parses a single ring with selector + label + tone", () => {
    const r = parseHighlightShorthand("#submit|Login button|warning");
    assert.equal(r.type, "ok");
    if (r.type !== "ok") return;
    assert.deepEqual(r.fixtures.rings, [{ selector: "#submit", label: "Login button", tone: "warning" }]);
  });

  it("parses multiple rings separated by ;", () => {
    const r = parseHighlightShorthand("#submit|Login button|warning; .error|Error banner|danger");
    assert.equal(r.type, "ok");
    if (r.type !== "ok") return;
    assert.deepEqual(r.fixtures.rings, [
      { selector: "#submit", label: "Login button", tone: "warning" },
      { selector: ".error", label: "Error banner", tone: "danger" },
    ]);
  });

  it("trims whitespace around rings and fields", () => {
    const r = parseHighlightShorthand("  #a | Label A  ;  #b | Label B | info  ");
    assert.equal(r.type, "ok");
    if (r.type !== "ok") return;
    assert.deepEqual(r.fixtures.rings, [
      { selector: "#a", label: "Label A" },
      { selector: "#b", label: "Label B", tone: "info" },
    ]);
  });

  it("ignores empty ring tokens (stray trailing ;)", () => {
    const r = parseHighlightShorthand("#a|Label A;");
    assert.equal(r.type, "ok");
    if (r.type !== "ok") return;
    assert.deepEqual(r.fixtures.rings, [{ selector: "#a", label: "Label A" }]);
  });

  it("rejects an empty payload", () => {
    assert.equal(parseHighlightShorthand("").type, "error");
    assert.equal(parseHighlightShorthand("   ").type, "error");
    assert.equal(parseHighlightShorthand(" ; ").type, "error");
  });

  it("rejects a ring with too few parts (no label)", () => {
    const r = parseHighlightShorthand("#submit");
    assert.equal(r.type, "error");
  });

  it("rejects a ring with too many parts", () => {
    const r = parseHighlightShorthand("#submit|Login|warning|extra");
    assert.equal(r.type, "error");
  });

  it("rejects an empty selector or label", () => {
    assert.equal(parseHighlightShorthand("|Label").type, "error");
    assert.equal(parseHighlightShorthand("#sel|").type, "error");
  });

  it("names the offending ring's position in the error", () => {
    const r = parseHighlightShorthand("#a|Label A; #bad");
    assert.equal(r.type, "error");
    if (r.type !== "error") return;
    assert.match(r.reason, /ring 2/);
  });

  it("selectors with pseudo-classes/attribute colons pass through untouched (';'/'|' don't collide with CSS)", () => {
    const r = parseHighlightShorthand('a:not(.x)|Not label; [href*="mailto:"]|Mailto label');
    assert.equal(r.type, "ok");
    if (r.type !== "ok") return;
    assert.deepEqual(r.fixtures.rings, [
      { selector: "a:not(.x)", label: "Not label" },
      { selector: '[href*="mailto:"]', label: "Mailto label" },
    ]);
  });
});
