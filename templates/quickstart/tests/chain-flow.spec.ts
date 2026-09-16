import { test, expect } from "@playwright/test";
import { MemPage, checkpoint, chainFlow } from "waygraph";
import { loginFlow } from "../src/flows/login.flow.js";
import { shopFlow } from "../src/flows/shop.flow.js";
import { LoginCreds } from "../src/states/checkout.mem-keys.js";

// Same chainFlow the step demo drives - automated, headless, no hand-clicking.
test("chainFlow: loginFlow then shopFlow completes checkout on saucedemo.com", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));

  const combined = chainFlow(loginFlow, shopFlow);
  const result = await combined.run(mem);

  expect(result).toEqual(checkpoint("OrderComplete"));
});

test("chainFlow blocks() lists the flattened episode chain in order", () => {
  const blocks = chainFlow(loginFlow, shopFlow).blocks();
  expect(blocks.map((b) => b.name)).toEqual([
    "nav-login",
    "submit-login",
    "add-to-cart",
    "nav-cart",
    "nav-checkout-info",
    "submit-checkout-info",
    "finish-order",
  ]);
});
