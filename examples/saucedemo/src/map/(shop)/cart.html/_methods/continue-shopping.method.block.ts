import { Trait } from "waygraph";
import type { PageHandle } from "waygraph";
import { CartSel } from "../_sel.js";

export const continueShopping = (self: PageHandle<"CartPage">) =>
  self.method({
    name: "continue-shopping",
    description: "Clicks 'Continue Shopping' on the cart page.",
    to: "InventoryPage",
    async act(page) {
      await page.locator(CartSel.continueShoppingBtn).click();
    },
    verify: [Trait.url({ pathname: "/inventory.html" })],
  });
