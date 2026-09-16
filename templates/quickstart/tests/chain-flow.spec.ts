import { test, expect } from "@playwright/test";
import { MemPage, checkpoint, chainFlow } from "waygraph";
import { loginFlow } from "../src/flows/login.flow.js";
import { shopFlow } from "../src/flows/shop.flow.js";
import { viewerBlockedFlow } from "../src/flows/viewer-blocked.flow.js";
import { LoginCreds, SelectedItem } from "../src/states/checkout.mem-keys.js";

const BACKPACK = SelectedItem({ id: "sauce-labs-backpack", name: "Sauce Labs Backpack" });

test("chainFlow: Episode 1 signs in + shops, Episode 2 locked-out user stays on LoginPage", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));
  mem.set(BACKPACK);

  const ep1 = chainFlow(loginFlow, shopFlow);
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

  const result = await chainFlow(loginFlow, shopFlow).run(mem);
  expect(result).toEqual(checkpoint("OrderComplete"));
});

test("chainFlow blocks() lists the flattened episode chain in order", () => {
  expect(loginFlow.title).toBe("Sign In");
  expect(shopFlow.title).toBe("Shop & Checkout");
  expect(viewerBlockedFlow.title).toBe("Viewer: Blocked Login Attempt");

  const blocks = chainFlow(loginFlow, shopFlow, viewerBlockedFlow).blocks();
  expect(blocks.map((b) => b.name)).toEqual([
    "nav-login",
    "submit-login",
    "add-to-cart",
    "nav-cart",
    "nav-checkout-info",
    "submit-checkout-info",
    "finish-order",
    "nav-login",
    "submit-login",
  ]);
  expect(blocks.every((b, i) => (i === 7 ? b.resetSessionBefore === true : !b.resetSessionBefore))).toBe(
    true,
  );
});
