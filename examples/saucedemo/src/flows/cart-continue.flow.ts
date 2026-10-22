import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavContinueShoppingBlock } from "../blocks/saucedemo-web/inventory-item/nav-continue-shopping.block.js";

export const cartContinueFlow = engine
  .map()
  .start()
  .gotoPage(
    NavCartBlock.stubBefore((ctx) => ctx.title("Cart then continue shopping")),
  )
  .gotoPage(NavContinueShoppingBlock)
  .end();
