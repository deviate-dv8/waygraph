import { engine } from "../../../config/waygraph.config.js";
import { ItemDetail } from "../../blocks/saucedemo-web/inventory-item/item-detail.page.block.js";
import { Menu } from "../../blocks/saucedemo-web/_layout.block.js";

export const catalogLogoutFlow = engine
  .map()
  .gotoPage(
    ItemDetail.nav.stubBefore((ctx) =>
      ctx.ui.title("Catalog browse then logout"),
    ),
  )
  .gotoPage(ItemDetail.do.backToProducts)
  .gotoPage(ItemDetail.nav)
  .gotoPage(Menu.go.allItems)
  .gotoPage(Menu.go.logout);
