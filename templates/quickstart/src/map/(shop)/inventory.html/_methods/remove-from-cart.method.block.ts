import type { PageHandle, Trait, WaygraphInstanceOption } from "waygraph";
import { SaucedemoKeys } from "../../../../states/checkout.mem-keys.js";
import { collectRemovableItems } from "../_items.js";
import { Inventory } from "../_page.block.js";
import { InventorySel } from "../_sel.js";

/** Takes the product named in mem out of the cart. One row per live Remove button in `auto` and Pilot. */
export const removeFromCart = (self: PageHandle<"InventoryPage">) =>
  self.method({
    name: "remove-from-cart",
    description: "Removes the item named by mem (saucedemo.selectedItem) from the cart.",
    requires: [SaucedemoKeys.selectedItem],
    async act(page, _input, mem) {
      const { id } = mem.get(SaucedemoKeys.selectedItem);
      await page.locator(InventorySel.removeBtn(id)).click();
    },
    verify: (): Trait[] => [
      Inventory.check("the item out of the cart", ({ items }, mem) => !items.some((item) => item.name === mem.get(SaucedemoKeys.selectedItem).name && item.inCart)),
    ],
    async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
      const items = await collectRemovableItems(page);
      return items.map((item) => ({ id: item.id, label: `Remove "${item.name}" from cart`, key: SaucedemoKeys.selectedItem, value: item, highlight: InventorySel.removeBtn(item.id) }));
    },
  });
