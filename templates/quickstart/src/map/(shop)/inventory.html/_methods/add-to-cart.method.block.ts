import type { PageHandle, Trait, WaygraphInstanceOption } from "waygraph";
import { SaucedemoKeys } from "../../../../states/checkout.mem-keys.js";
import { collectAddableItems } from "../_items.js";
import { Inventory } from "../_page.block.js";
import { InventorySel } from "../_sel.js";

/** Puts the product named in mem in the cart. The page stays the inventory; its read shows the product in the cart. One row per live Add button in `auto` and Pilot. */
export const addToCart = (self: PageHandle<"InventoryPage">) =>
  self.method({
    name: "add-to-cart",
    description: "Adds the item named by mem (saucedemo.selectedItem) to the cart.",
    requires: [SaucedemoKeys.selectedItem],
    async act(page, _input, mem) {
      const { id } = mem.get(SaucedemoKeys.selectedItem);
      await page.locator(InventorySel.addBtn(id)).click();
    },
    verify: (): Trait[] => [
      Inventory.check("the item in the cart", ({ items }, mem) => items.some((item) => item.name === mem.get(SaucedemoKeys.selectedItem).name && item.inCart)),
    ],
    async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
      const items = await collectAddableItems(page);
      return items.map((item) => ({ id: item.id, label: `Add "${item.name}" to cart`, key: SaucedemoKeys.selectedItem, value: item, highlight: InventorySel.addBtn(item.id) }));
    },
  });
