import { engine } from "../../config/waygraph.config.js";
import { Cart } from "../blocks/saucedemo-web/cart/cart.page.block.js";

export const cartContinueFlow = engine
  .map()
  .gotoPage(
    Cart.nav.stubBefore((ctx) => ctx.ui.title("Cart then continue shopping")),
  )
  .gotoPage(Cart.do.continueShopping);
