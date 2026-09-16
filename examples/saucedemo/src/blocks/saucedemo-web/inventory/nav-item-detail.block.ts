import { defineMemNavBlock, Trait, type WaygraphInstanceOption } from "waygraph";
import type { ItemDetailPage } from "../../../states/checkout.states.js";
import { SelectedItem } from "../../../states/checkout.mem-keys.js";
import {
  collectInventoryItems,
  InventorySel,
} from "./methods/inventory-items.js";

/**
 * Kind: Nav
 * Helper: defineMemNavBlock
 * Route: saucedemo-web/inventory/  (= /inventory.html)
 *
 * Opens the mem-picked product detail page. waygraph auto lists one
 * "Open ... details" row per inventory card via instanceOptions.
 */
export const NavItemDetailBlock = defineMemNavBlock<ItemDetailPage>({
  name: "nav-item-detail",
  description: "Opens the product named by mem (saucedemo.selectedItem) on its detail page.",
  checkpoint: "ItemDetailPage",
  requires: [SelectedItem.key],
  click: (mem) => InventorySel.title(mem.get(SelectedItem.key).id),
  verify: [Trait.url({ pathname: "/inventory-item.html" })],
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const items = await collectInventoryItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Open "${item.name}" details`,
      key: SelectedItem.key,
      value: item,
      highlight: InventorySel.title(item.id),
    }));
  },
});
