import { Trait } from "waygraph";
import type { PageHandle } from "waygraph";
import { ItemDetailSel } from "../_sel.js";

export const backToProducts = (self: PageHandle<"ItemDetailPage">) =>
  self.method({
    name: "back-to-products",
    description: "Clicks 'Back to products' on the item detail page.",
    to: "InventoryPage",
    async act(page) {
      await page.locator(ItemDetailSel.backToProductsBtn).click();
    },
    verify: [Trait.url({ pathname: "/inventory.html" })],
  });
