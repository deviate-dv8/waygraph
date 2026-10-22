import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { NavItemDetailBlock } from "../blocks/saucedemo-web/inventory/nav-item-detail.block.js";
import { NavBackToInventoryBlock } from "../blocks/saucedemo-web/inventory-item/nav-back-to-inventory.block.js";
import { SubmitLogoutBlock } from "../blocks/saucedemo-web/methods/submit-logout.method.block.js";

export const catalogLogoutFlow = engine
  .map()
  .start()
  .gotoPage(
    NavItemDetailBlock.stubBefore((ctx) =>
      ctx.title("Catalog browse then logout"),
    ),
  )
  .gotoPage(NavBackToInventoryBlock)
  .method(SubmitLogoutBlock)
  .end();
