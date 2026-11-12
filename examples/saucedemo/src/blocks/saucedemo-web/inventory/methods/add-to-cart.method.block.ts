import { defineMethodBlock, type WaygraphInstanceOption, type Trait } from "waygraph";
import { InventoryPage } from "../../../../states/checkout.states.js";
import { } from "../../../../states/checkout.reads.js";
import { SaucedemoKeys } from "../../../../states/checkout.mem-keys.js";
import { collectAddableItems, InventorySel } from "./inventory-items.js";
import { Inventory } from "../inventory.page.block.js";

/**
 * Kind: Method (one row of many)
 * Helper: defineMethodBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Puts the mem-picked product in the cart; the page stays the inventory, and
 * its Read Block shows the product in the cart. waygraph auto lists one
 * "Add ..." row per live Add button via instanceOptions.
 */
export const AddToCartBlock = defineMethodBlock({
  name: "add-to-cart",
  description:
    "Adds the item named by mem (saucedemo.selectedItem) to the cart.",
  to: InventoryPage,
  requires: [SaucedemoKeys.selectedItem],
  async act(page, _input, mem) {
    const { id } = mem.get(SaucedemoKeys.selectedItem);
    await page.locator(InventorySel.addBtn(id)).click();
  },
  verify: (): Trait[] => [
    Inventory.read.items.passes(
      (items, mem) => items.some((item) => item.name === mem.get(SaucedemoKeys.selectedItem).name && item.inCart),
      "the item in the cart",
    ),
  ],
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const items = await collectAddableItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Add "${item.name}" to cart`,
      key: SaucedemoKeys.selectedItem,
      value: item,
      highlight: InventorySel.addBtn(item.id),
    }));
  },
});
