import { Trait } from "waygraph";
import type { PageHandle } from "waygraph";
import { ItemDetailSel } from "../../inventory-item.html/_sel.js";

export const backHome = (self: PageHandle<"OrderComplete">) =>
  self.method({
    name: "back-home",
    description: "Clicks 'Back Home' on the order confirmation page.",
    to: "InventoryPage",
    async act(page) {
      await page.locator(ItemDetailSel.backToProductsBtn).click();
    },
    verify: [Trait.url({ pathname: "/inventory.html" })],
  });
