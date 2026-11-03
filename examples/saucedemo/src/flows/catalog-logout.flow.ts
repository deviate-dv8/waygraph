import { engine } from "../../config/waygraph.config.js";
import { ItemDetail } from "../blocks/saucedemo-web/inventory-item/item-detail.page.block.js";
import { Inventory } from "../blocks/saucedemo-web/inventory/inventory.page.block.js";

export const catalogLogoutFlow = engine
  .map()
  .gotoPage(
    ItemDetail.nav.stubBefore((ctx) =>
      ctx.ui.title("Catalog browse then logout"),
    ),
  )
  .gotoPage(ItemDetail.do.backToProducts)
  .method(Inventory.do.logout);
