import { defineMethodBlock, checkpoint, type Checkpoint } from "waygraph";
import type { RemoveFromCartOutcome } from "../../../../states/checkout.states.js";
import { collectAddableItems, InventorySel } from "./inventory-items.js";

type BulkObserve = "added" | "nothing";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: saucedemo-web/inventory/methods/  (= /inventory.html)
 *
 * Bulk: click every live "Add to cart" once. No instanceOptions - one auto
 * menu row. In is Checkpoint<string> (from: "*") so back-and-forth works:
 * leave inventory and return, collectors re-read Add buttons from the DOM.
 * Out: ItemInCart if the cart has items after; LoggedIn if still empty.
 */
export const AddAllToCartBlock = defineMethodBlock<
  Checkpoint<string>,
  RemoveFromCartOutcome
>({
  name: "add-all-to-cart",
  description: "Adds every product still showing Add to cart on this page.",
  instruction: {
    async act(page) {
      const items = await collectAddableItems(page);
      for (const item of items) {
        await page.locator(InventorySel.addBtn(item.id)).click();
      }
    },
    async observe(page): Promise<BulkObserve> {
      const badge = await page.locator(InventorySel.cartBadge).count();
      return badge > 0 ? "added" : "nothing";
    },
    resolve: (observed) =>
      checkpoint(observed === "added" ? "ItemInCart" : "LoggedIn"),
    verify: (out) =>
      out.__state === "ItemInCart"
        ? [
            {
              name: "cart-has-items",
              async check(page) {
                return (await page.locator(InventorySel.cartBadge).count()) > 0;
              },
            },
          ]
        : [
            {
              name: "cart-still-empty",
              async check(page) {
                return (await page.locator(InventorySel.cartBadge).count()) === 0;
              },
            },
          ],
  },
});
