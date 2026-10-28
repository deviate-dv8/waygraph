import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { checkoutThenBrowseAgainFlow } from "../src/flows/checkout-then-browse-again.flow.js";
import { SaucedemoKeys } from "../src/states/checkout.mem-keys.js";

// Proves the click-based nav-* convention for real, not just that it
// compiles: nav-back-to-products.block.ts declares click: "#back-to-products"
// instead of url: "/inventory.html" - if the generated act() were somehow
// still doing a goto() under the hood, this page never actually holds a
// "Back Home" button to click, so the flow would throw instead of reaching
// LoggedIn a second time.
test("checkoutThenBrowseAgainFlow: a click-based NavBlock lands back on inventory for real", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });
  mem.set(SaucedemoKeys.selectedItem, { id: "sauce-labs-backpack", name: "Sauce Labs Backpack" });

  const result = await checkoutThenBrowseAgainFlow.run(mem);

  expect(result).toEqual(checkpoint("LoggedIn"));
});
