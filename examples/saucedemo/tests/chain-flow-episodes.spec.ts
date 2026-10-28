import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { engine } from "../config/waygraph.config.js";
import { loginFlow } from "../src/flows/login.flow.js";
import { shopFlow } from "../src/flows/shop.flow.js";
import { SaucedemoKeys } from "../src/states/checkout.mem-keys.js";

// Proves the 2-episode nested-flow scenario the step-mode CLI demo shows
// interactively ("Episode 1: Sign In" -> "Episode 2: Shop & Checkout") also
// works as a real, automated, headless test - not just something you have
// to click through by hand. loginFlow/shopFlow are the exact same Flow
// objects `waygraph chain "loginFlow(...) then shopFlow"` drives.
test("nested flows run 2 episodes (loginFlow then shopFlow) against the real live site", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });
  mem.set(SaucedemoKeys.selectedItem, { id: "sauce-labs-backpack", name: "Sauce Labs Backpack" });

  const combined = engine.map().start().flow(loginFlow).flow(shopFlow).end();
  const result = await combined.run(mem);

  expect(result).toEqual(checkpoint("OrderComplete"));
});

test("blocks() reports the flattened chain in order", () => {
  const combined = engine.map().start().flow(loginFlow).flow(shopFlow).end();
  const blocks = combined.blocks();

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
  ]);
  // Neither loginFlow nor shopFlow is wrapped in withSessionReset here (a
  // same-session chain, not a fresh-login re-entry), so no block should
  // carry a reset boundary flag - resetSessionBefore is for the
  // double-login case, not every episode break.
  expect(blocks.every((b) => !b.resetSessionBefore)).toBe(true);
});
