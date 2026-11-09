import { defineMethodBlock } from "waygraph";
import { LoggedIn } from "../../../../states/checkout.states.js";
import { Catalog } from "../../../../states/checkout.reads.js";
import { collectRemovableItems, InventorySel } from "./inventory-items.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Bulk: click every live "Remove" once. No instanceOptions - one auto menu
 * row. From anywhere (from: "*") so round-trips work the same as single-item
 * remove. The page stays the inventory; its Read Block shows nothing in the cart.
 */
export const RemoveAllFromCartBlock = defineMethodBlock({
  name: "remove-all-from-cart",
  description: "Removes every product still showing Remove on this page.",
  to: LoggedIn,
  instruction: {
    async act(page) {
      const items = await collectRemovableItems(page);
      for (const item of items) {
        await page.locator(InventorySel.removeBtn(item.id)).click();
      }
    },
    verify: [Catalog.items.passes((items) => items.every((item) => !item.inCart), "nothing in the cart")],
  },
});
