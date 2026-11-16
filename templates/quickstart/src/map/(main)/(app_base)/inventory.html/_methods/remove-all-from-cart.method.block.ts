import { Trait } from "waygraph";
import type { PageHandle } from "waygraph";
import { collectRemovableItems } from "../_items.js";
import { Inventory } from "../_page.block.js";
import { InventorySel } from "../_sel.js";

/** Clicks every Remove still showing. */
export const removeAllFromCart = (self: PageHandle<"InventoryPage">) =>
  self.method({
    name: "remove-all-from-cart",
    description: "Removes every product still showing Remove on this page.",
    precondition: [Trait.visible(InventorySel.removeBtnPrefix)],
    async act(page) {
      for (const item of await collectRemovableItems(page)) await page.locator(InventorySel.removeBtn(item.id)).click();
    },
    verify: (): Trait[] => [Inventory.check("nothing in the cart", ({ items }) => items.every((item) => !item.inCart))],
  });
