import { defineEffectBlock, checkpoint, type Checkpoint, type WaygraphInstanceOption } from "waygraph";
import type { ItemInCart } from "../../../../states/checkout.states.js";
import { SelectedItem } from "../../../../states/checkout.mem-keys.js";
import { collectAddableItems, InventorySel } from "./inventory-items.js";

/**
 * Kind: Effect
 * Helper: defineEffectBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Mutates cart for the mem-picked product. waygraph auto lists one
 * "Add ..." row per live Add button via instanceOptions.
 */
export const AddToCartBlock = defineEffectBlock<Checkpoint<string>, ItemInCart>({
  name: "add-to-cart",
  description: "Adds the item named by mem (saucedemo.selectedItem) to the cart.",
  requires: [SelectedItem.key],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(SelectedItem.key);
      await page.locator(InventorySel.addBtn(id)).click();
    },
    resolve: () => checkpoint("ItemInCart"),
    verify: [
      {
        name: "item-added-to-cart",
        async check(page, mem) {
          const { id } = mem.get(SelectedItem.key);
          return await page.locator(InventorySel.removeBtn(id)).first().isVisible();
        },
      },
    ],
    stubBefore: {},
    stubAfter: {
      badge: {
        selector: InventorySel.cartBadge,
        label: "Cart badge",
        detail: "Item is in the cart",
      },
    },
  },
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const items = await collectAddableItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Add "${item.name}" to cart`,
      key: SelectedItem.key,
      value: item,
      highlight: InventorySel.addBtn(item.id),
    }));
  },
});
