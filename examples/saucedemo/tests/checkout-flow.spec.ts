import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { checkoutFlow } from "../src/flows/checkout.flow.js";
import { LoginCreds, SelectedItem } from "../src/states/checkout.mem-keys.js";

// Thin on purpose - specs/ only ever seed MemPage and call a flow. All real logic
// lives in blocks/, all composition lives in flows/. No `context` fixture needed
// here - checkoutFlow's Engine is configured non-headless and owns its own browser.
test("Waygraph drives saucedemo.com through login -> add to cart -> checkout -> order complete", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));
  mem.set(SelectedItem({ id: "sauce-labs-backpack", name: "Sauce Labs Backpack" }));

  const result = await checkoutFlow.run(mem);

  expect(result).toEqual(checkpoint("OrderComplete"));
});
