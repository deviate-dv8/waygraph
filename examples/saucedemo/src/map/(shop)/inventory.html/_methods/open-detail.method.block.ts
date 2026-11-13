import { Trait } from "waygraph";
import type { PageHandle, WaygraphInstanceOption } from "waygraph";
import { SaucedemoKeys } from "../../../../states/checkout.mem-keys.js";
import { collectInventoryItems } from "../_items.js";
import { InventorySel } from "../_sel.js";

/** Opens the product named in mem on its detail page. One row per product card in `auto` and Pilot. */
export const openDetail = (self: PageHandle<"InventoryPage">) =>
  self.method({
    name: "open-detail",
    description: "Opens the product named by mem (saucedemo.selectedItem) on its detail page.",
    to: "ItemDetailPage",
    requires: [SaucedemoKeys.selectedItem],
    async act(page, _input, mem) {
      await page.locator(InventorySel.title(mem.get(SaucedemoKeys.selectedItem).id)).click();
    },
    verify: [Trait.url({ pathname: "/inventory-item.html" })],
    async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
      const items = await collectInventoryItems(page);
      return items.map((item) => ({ id: item.id, label: `Open "${item.name}" details`, key: SaucedemoKeys.selectedItem, value: item, highlight: InventorySel.title(item.id) }));
    },
  });
