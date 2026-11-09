import { defineMethodBlock } from "waygraph";
import { LoggedIn } from "../../../../states/checkout.states.js";
import { Catalog } from "../../../../states/checkout.reads.js";
import { collectAddableItems, InventorySel } from "./inventory-items.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Bulk: click every live "Add to cart" once. No instanceOptions - one auto
 * menu row. From anywhere (from: "*") so back-and-forth works: leave inventory
 * and return, collectors re-read Add buttons from the DOM. The page stays the
 * inventory; its Read Block shows every item in the cart.
 */
export const AddAllToCartBlock = defineMethodBlock({
  name: "add-all-to-cart",
  description: "Adds every product still showing Add to cart on this page.",
  to: LoggedIn,
  instruction: {
    async act(page) {
      const items = await collectAddableItems(page);
      for (const item of items) {
        await page.locator(InventorySel.addBtn(item.id)).click();
      }
    },
    verify: [Catalog.items.passes((items) => items.every((item) => item.inCart), "every item in the cart")],
  },
});
