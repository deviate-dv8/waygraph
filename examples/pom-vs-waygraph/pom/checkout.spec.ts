import { test, expect } from "@playwright/test";
import { applyUiChange } from "../ui-change.js";
import { LoginPage } from "./pages/login.page.js";
import { InventoryPage } from "./pages/inventory.page.js";
import { CartPage } from "./pages/cart.page.js";
import { CheckoutPage } from "./pages/checkout.page.js";

// The checkout as page objects, written the usual way: actions in the pages, assertions in the test.
test("checkout: sign in, add the backpack, check out, the order is placed", async ({ page }) => {
  await applyUiChange(page.context());
  const login = new LoginPage(page);
  await login.open();
  await login.login("standard_user", "secret_sauce");

  const inventory = new InventoryPage(page);
  await inventory.addToCart("sauce-labs-backpack");
  await inventory.openCart();

  const cart = new CartPage(page);
  await expect(cart.items).toHaveCount(1);
  await cart.checkout();

  const checkout = new CheckoutPage(page);
  await checkout.fillInfo("Ada", "Lovelace", "12345");
  await checkout.continue();
  await checkout.finish();
  await expect(checkout.completeHeader).toHaveText("Thank you for your order!");
});
