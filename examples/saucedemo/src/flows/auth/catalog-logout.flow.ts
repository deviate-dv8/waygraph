import { engine } from "../../../config/waygraph.config.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { ItemDetail } from "../../map/(shop)/inventory-item.html/_page.block.js";
import { Menu } from "../../map/(shop)/menu/_page.block.js";

/** Browse a product and back, use the menu to see everything, then sign out. */
export const catalogLogoutFlow = engine
  .map({ title: "Browse, then sign out", description: "Open a product, go back, use the menu, and log out.", labels: ["auth"] })
  .gotoPage(Inventory.stubBefore((ctx) => ctx.ui.title("Catalog browse then logout")))
  .method(Inventory.do.openDetail)
  .method(ItemDetail.do.backToProducts)
  .gotoPage(Menu.links.allItems)
  .gotoPage(Menu.links.logout);
