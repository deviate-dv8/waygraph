import { defineEffectBlock, checkpoint, type Checkpoint, type WaygraphInstanceOption } from "waygraph";
import type { ItemInCart } from "../../states/checkout.states.js";
import { SelectedItem } from "../../states/checkout.mem-keys.js";
import { collectAddableItems } from "./inventory-items.js";

// EffectBlock: mutates cart for the mem-picked product. waygraph auto lists
// one "Add …" row per live Add button via instanceOptions.
export const AddToCartBlock = defineEffectBlock<Checkpoint<string>, ItemInCart>({
  name: "add-to-cart",
  description: "Adds the item named by mem (saucedemo.selectedItem) to the cart.",
  requires: [SelectedItem.key],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(SelectedItem.key);
      await page.locator(`[data-test="add-to-cart-${id}"]`).click();
    },
    resolve: () => checkpoint("ItemInCart"),
    verify: [
      {
        name: "item-added-to-cart",
        async check(page, mem) {
          const { id } = mem.get(SelectedItem.key);
          return await page.locator(`[data-test="remove-${id}"]`).first().isVisible();
        },
      },
    ],
    highlights: () => [{ selector: ".shopping_cart_badge", label: "remember this: cart now has the item" }],
  },
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const items = await collectAddableItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Add "${item.name}" to cart`,
      key: SelectedItem.key,
      value: item,
      highlight: `[data-test="add-to-cart-${item.id}"]`,
    }));
  },
});
