import { defineMethodBlock, type Trait } from "waygraph";
import { InventoryPage } from "../../../../states/checkout.states.js";
import { } from "../../../../states/checkout.reads.js";
import { collectRemovableItems, InventorySel } from "./inventory-items.js";
import { Inventory } from "../inventory.page.block.js";

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
  to: InventoryPage,
  async act(page) {
    const items = await collectRemovableItems(page);
    for (const item of items) {
      await page.locator(InventorySel.removeBtn(item.id)).click();
    }
  },
  verify: (): Trait[] => [Inventory.check("nothing in the cart", ({ items }) => items.every((item) => !item.inCart))],
});
