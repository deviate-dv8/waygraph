import { defineEffectBlock, checkpoint, type Checkpoint, type WaygraphInstanceOption } from "waygraph";
import type { RemoveFromCartOutcome } from "../../states/checkout.states.js";
import { SelectedItem } from "../../states/checkout.mem-keys.js";
import { collectRemovableItems } from "./inventory-items.js";

type RemoveObserve = "still-has-items" | "cart-empty";

// EffectBlock: removes the mem-picked product. After Add, waygraph auto
// shows matching "Remove …" rows from the live Remove buttons.
export const RemoveFromCartBlock = defineEffectBlock<Checkpoint<string>, RemoveFromCartOutcome>({
  name: "remove-from-cart",
  description: "Removes the item named by mem (saucedemo.selectedItem) from the cart.",
  requires: [SelectedItem.key],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(SelectedItem.key);
      await page.locator(`[data-test="remove-${id}"]`).click();
    },
    async observe(page): Promise<RemoveObserve> {
      const left = await collectRemovableItems(page);
      return left.length > 0 ? "still-has-items" : "cart-empty";
    },
    resolve: (observed) =>
      checkpoint(observed === "still-has-items" ? "ItemInCart" : "LoggedIn"),
    verify: (out) =>
      out.__state === "ItemInCart"
        ? [
            {
              name: "cart-still-has-items",
              async check(page) {
                return (await collectRemovableItems(page)).length > 0;
              },
            },
          ]
        : [
            {
              name: "cart-empty",
              async check(page) {
                return (await page.locator(".shopping_cart_badge").count()) === 0;
              },
            },
          ],
  },
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const items = await collectRemovableItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Remove "${item.name}" from cart`,
      key: SelectedItem.key,
      value: item,
      highlight: `[data-test="remove-${item.id}"]`,
    }));
  },
});
