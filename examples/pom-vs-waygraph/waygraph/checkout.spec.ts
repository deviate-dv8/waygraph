import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { applyUiChange } from "../ui-change.js";
import { checkoutFlow } from "../../saucedemo/src/flows/checkout.flow.js";
import { SaucedemoKeys } from "../../saucedemo/src/states/checkout.mem-keys.js";
// The cart's Blocks check what the inventory shows through its Read Block. `waygraph test` loads a project's Read
// Blocks itself; this comparison runs every suite under plain Playwright, so it loads the one the flow reads.
import "../../saucedemo/src/blocks/saucedemo-web/inventory/inventory.read.block.js";

// The same checkout as the saucedemo example's flow: each step checks it arrived and took effect (its verify).
test("checkout: sign in, add the backpack, check out, the order is placed", async ({ context }) => {
  await applyUiChange(context);
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });
  mem.set(SaucedemoKeys.selectedItem, { id: "sauce-labs-backpack", name: "Sauce Labs Backpack" });
  expect(await checkoutFlow.run(context, mem)).toEqual(checkpoint("OrderComplete"));
});
