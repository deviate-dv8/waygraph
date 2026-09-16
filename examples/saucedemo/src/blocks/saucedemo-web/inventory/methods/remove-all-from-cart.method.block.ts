import { defineMethodBlock, checkpoint, type Checkpoint } from "waygraph";
import type { RemoveFromCartOutcome } from "../../../../states/checkout.states.js";
import { collectRemovableItems, InventorySel } from "./inventory-items.js";

type BulkObserve = "still-has-items" | "cart-empty";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Bulk: click every live "Remove" once. No instanceOptions - one auto menu
 * row. In is Checkpoint<string> (from: "*") so round-trips work the same as
 * single-item remove. Out: LoggedIn when cart empty; ItemInCart if anything
 * remains (partial failure / race).
 */
export const RemoveAllFromCartBlock = defineMethodBlock<
  Checkpoint<string>,
  RemoveFromCartOutcome
>({
  name: "remove-all-from-cart",
  description: "Removes every product still showing Remove on this page.",
  instruction: {
    async act(page) {
      const items = await collectRemovableItems(page);
      for (const item of items) {
        await page.locator(InventorySel.removeBtn(item.id)).click();
      }
    },
    async observe(page): Promise<BulkObserve> {
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
                return (await page.locator(InventorySel.cartBadge).count()) === 0;
              },
            },
          ],
  },
});
