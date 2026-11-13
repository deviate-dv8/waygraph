import { Trait } from "waygraph";
import type { PageHandle } from "waygraph";
import { collectAddableItems } from "../_items.js";
import { Inventory } from "../_page.block.js";
import { InventorySel } from "../_sel.js";

/** Clicks every Add to cart still showing. */
export const addAllToCart = (self: PageHandle<"InventoryPage">) =>
  self.method({
    name: "add-all-to-cart",
    description: "Adds every product still showing Add to cart on this page.",
    precondition: [Trait.visible(InventorySel.addBtnPrefix)],
    async act(page) {
      for (const item of await collectAddableItems(page)) await page.locator(InventorySel.addBtn(item.id)).click();
    },
    verify: (): Trait[] => [Inventory.check("every item in the cart", ({ items }) => items.every((item) => item.inCart))],
  });
