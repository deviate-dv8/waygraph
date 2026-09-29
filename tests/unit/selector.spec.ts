import { test } from "node:test";
import assert from "node:assert/strict";
import { css, byText, byRole } from "../../src/selector.js";

test("css() passes a plain selector through unchanged", () => {
  assert.equal(css("#login-button"), "#login-button");
  assert.equal(css(".inventory_item .btn_primary"), ".inventory_item .btn_primary");
});

test("css() throws on an XPath instead of silently accepting it", () => {
  assert.throws(() => css("//div[@class='foo']"), /looks like an XPath/);
});

test("css() throws on a regex text-match pseudo-class", () => {
  assert.throws(() => css(':has-text(/^Submit$/)'), /regex text-match/);
  assert.throws(() => css(":text-matches(foo)"), /regex text-match/);
});

test("byText() builds an exact-match selector by default, scoped to `within` when given", () => {
  assert.equal(byText("Login"), '*:text-is("Login")');
  assert.equal(byText("Submit", { within: "form" }), 'form :text-is("Submit")');
});

test("byText() builds a substring match with { contains: true }", () => {
  assert.equal(byText("out of stock", { contains: true }), '*:has-text("out of stock")');
});

test("byText() escapes embedded quotes", () => {
  assert.equal(byText('Say "hi"'), '*:text-is("Say \\"hi\\"")');
});

test("byRole() builds a bare role selector with no options", () => {
  assert.equal(byRole("button"), "role=button");
});

test("byRole() builds an attributed role selector", () => {
  assert.equal(byRole("button", { name: "Login" }), 'role=button[name="Login"]');
  assert.equal(
    byRole("checkbox", { name: "Remember me", checked: true }),
    'role=checkbox[name="Remember me"][checked=true]',
  );
});
