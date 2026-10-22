import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { engine } from "../config/waygraph.config.js";
import { loginFlow } from "../src/flows/login.flow.js";
import { shopFlow } from "../src/flows/shop.flow.js";
import { viewerBlockedFlow } from "../src/flows/viewer-blocked.flow.js";
import { LoginCreds, SelectedItem } from "../src/states/checkout.mem-keys.js";

const BACKPACK = SelectedItem({ id: "sauce-labs-backpack", name: "Sauce Labs Backpack" });

test("nested flows: Episode 1 signs in + shops, Episode 2 locked-out user stays on LoginPage", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));
  mem.set(BACKPACK);

  const ep1 = engine.map().start().flow(loginFlow).flow(shopFlow).end();
  const result1 = await ep1.run(mem);
  expect(result1).toEqual(checkpoint("OrderComplete"));

  mem.set(LoginCreds({ username: "locked_out_user", password: "secret_sauce" }));
  const result2 = await viewerBlockedFlow.run(mem);
  expect(result2).toEqual(checkpoint("LoginPage"));
});

test("shopFlow alone: already-seeded SelectedItem completes checkout after loginFlow", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));
  mem.set(BACKPACK);

  const result = await engine.map().start().flow(loginFlow).flow(shopFlow).end().run(mem);
  expect(result).toEqual(checkpoint("OrderComplete"));
});

test("blocks() lists the flattened episode chain in order", () => {
  const blocks = engine.map().start().flow(loginFlow).flow(shopFlow).flow(viewerBlockedFlow).end().blocks();
  expect(blocks.map((b) => b.name)).toEqual([
    "nav-login",
    "fill-username",
    "fill-password",
    "submit-login",
    "add-to-cart",
    "nav-cart",
    "nav-checkout-info",
    "fill-first-name",
    "fill-last-name",
    "fill-postal-code",
    "submit-checkout-info",
    "finish-order",
    "nav-login",
    "fill-username",
    "fill-password",
    "submit-login",
  ]);
  expect(blocks.every((b, i) => (i === 12 ? b.resetSessionBefore === true : !b.resetSessionBefore))).toBe(
    true,
  );
});
