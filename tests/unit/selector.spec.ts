import { test } from "node:test";
import assert from "node:assert/strict";
import { sel } from "../../src/engine/trait/selector.js";

test("sel.css passes a plain selector through unchanged", () => {
  assert.equal(sel.css("#login-button"), "#login-button");
  assert.equal(sel.css(".inventory_item .btn_primary"), ".inventory_item .btn_primary");
});

test("sel.css throws on an XPath or a regex text match instead of accepting it", () => {
  assert.throws(() => sel.css("//div[@class='foo']"), /looks like an XPath/);
  assert.throws(() => sel.css(":has-text(/^Submit$/)"), /regex text match/);
  assert.throws(() => sel.css(":text-matches(foo)"), /regex text match/);
});

test("sel.role writes the role with its props, the name ignoring case unless exact", () => {
  assert.equal(sel.role("button"), "internal:role=button");
  assert.equal(sel.role("button", { name: "Login" }), 'internal:role=button[name="Login"i]');
  assert.equal(sel.role("button", { name: "Login", exact: true }), 'internal:role=button[name="Login"s]');
  assert.equal(sel.role("checkbox", { name: "Remember me", checked: true }), 'internal:role=checkbox[checked=true][name="Remember me"i]');
  assert.equal(sel.role("heading", { level: 2, name: /^Cart/i }), "internal:role=heading[level=2][name=/^Cart/i]");
});

test("sel.text, label, placeholder, altText and title escape quotes and take exact or a regex", () => {
  assert.equal(sel.text("Say \"hi\""), 'internal:text="Say \\"hi\\""i');
  assert.equal(sel.text("Sign in", { exact: true }), 'internal:text="Sign in"s');
  assert.equal(sel.label("Email"), 'internal:label="Email"i');
  assert.equal(sel.placeholder("Search"), 'internal:attr=[placeholder="Search"i]');
  assert.equal(sel.altText("Logo", { exact: true }), 'internal:attr=[alt="Logo"s]');
  assert.equal(sel.title(/close/i), "internal:attr=[title=/close/i]");
});

test("sel.testId uses data-testid, or the attribute the app has, and is exact", () => {
  assert.equal(sel.testId("username"), 'internal:testid=[data-testid="username"s]');
  assert.equal(sel.testId("username", { attribute: "data-test" }), 'internal:testid=[data-test="username"s]');
});

test("sel.within puts a selector inside another", () => {
  assert.equal(sel.within(sel.css("form"), sel.role("button")), "form >> internal:role=button");
});

test("a _sel.ts entry written with sel.* and fixed arguments is read as its selector string, a function entry stays code", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { selectorEntries } = await import("../../src/manifest/selectors.js");
  const dir = mkdtempSync(join(tmpdir(), "wg-sel-"));
  try {
    const file = join(dir, "_sel.ts");
    writeFileSync(file, `import { sel } from "waygraph";
export const LoginSel = {
  plain: "#user-name",
  submit: sel.role("button", { name: "Login" }),
  heading: sel.role("heading", { level: 2, name: /^Cart/i }),
  inForm: sel.within(sel.css("form#login"), sel.testId("go", { attribute: "data-test" })),
  field: (name: string) => sel.label(name),
};
`);
    const by = Object.fromEntries(selectorEntries(file, "_sel.ts").map((e) => [e.name, e]));
    assert.deepEqual([by["LoginSel.plain"]?.selector, by["LoginSel.plain"]?.literal], ["#user-name", true]);
    assert.deepEqual([by["LoginSel.submit"]?.selector, by["LoginSel.submit"]?.literal], ['internal:role=button[name="Login"i]', true]);
    assert.equal(by["LoginSel.heading"]?.selector, "internal:role=heading[level=2][name=/^Cart/i]");
    assert.equal(by["LoginSel.inForm"]?.selector, 'form#login >> internal:testid=[data-test="go"s]');
    assert.equal(by["LoginSel.field"]?.literal, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("coverage entries mark a selector only Playwright reads, and not a plain one", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { coverageEntries } = await import("../../src/analysis/coverage-gap.js");
  const dir = mkdtempSync(join(tmpdir(), "wg-cov-"));
  try {
    mkdirSync(join(dir, "src", "map", "login"), { recursive: true });
    writeFileSync(join(dir, "src", "map", "login", "_sel.ts"), `import { sel } from "waygraph";
export const LoginSel = { plain: "#user-name", submit: sel.role("button", { name: "Login" }) };
`);
    const by = Object.fromEntries(coverageEntries(dir, { navBlocks: [] }).filter((e) => e.name).map((e) => [e.name, e]));
    assert.equal(by["LoginSel.plain"]?.engine, undefined);
    assert.equal(by["LoginSel.submit"]?.engine, true);
    assert.equal(by["LoginSel.submit"]?.selector, 'internal:role=button[name="Login"i]');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
