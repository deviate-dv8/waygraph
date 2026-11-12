import { defineMethodBlock, type WaygraphInstanceOption, type Trait } from "waygraph";
import { InventoryPage } from "../../../../states/checkout.states.js";
import { } from "../../../../states/checkout.reads.js";
import { SaucedemoKeys } from "../../../../states/checkout.mem-keys.js";
import { collectRemovableItems, InventorySel } from "./inventory-items.js";
import { Inventory } from "../inventory.page.block.js";

/**
 * Kind: Method (one row of many)
 * Helper: defineMethodBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Removes the mem-picked product. After Add, waygraph auto shows matching
 * "Remove ..." rows from live Remove buttons. The page stays the inventory;
 * its Read Block shows the product out of the cart.
 */
export const RemoveFromCartBlock = defineMethodBlock({
  name: "remove-from-cart",
  description: "Removes the item named by mem (saucedemo.selectedItem) from the cart.",
  to: InventoryPage,
  requires: [SaucedemoKeys.selectedItem],
  async act(page, _input, mem) {
    const { id } = mem.get(SaucedemoKeys.selectedItem);
    await page.locator(InventorySel.removeBtn(id)).click();
  },
  verify: (): Trait[] => [
    Inventory.read.items.passes(
      (items, mem) => !items.some((item) => item.name === mem.get(SaucedemoKeys.selectedItem).name && item.inCart),
      "the item out of the cart",
    ),
  ],
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const items = await collectRemovableItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Remove "${item.name}" from cart`,
      key: SaucedemoKeys.selectedItem,
      value: item,
      highlight: InventorySel.removeBtn(item.id),
    }));
  },
});
