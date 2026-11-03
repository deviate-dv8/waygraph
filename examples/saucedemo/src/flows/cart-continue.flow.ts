import { engine } from "../../config/waygraph.config.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavContinueShoppingBlock } from "../blocks/saucedemo-web/inventory-item/nav-continue-shopping.block.js";

export const cartContinueFlow = engine
  .map()
  .gotoPage(
    NavCartBlock.stubBefore((ctx) => ctx.ui.title("Cart then continue shopping")),
  )
  .gotoPage(NavContinueShoppingBlock);
