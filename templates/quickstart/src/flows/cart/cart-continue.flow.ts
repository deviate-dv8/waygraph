import { engine } from "../../../config/waygraph.config.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";

export const cartContinueFlow = engine
  .map({ title: "Continue shopping", description: "From the cart, back to the catalogue.", labels: ["cart"] })
  .gotoPage(
    Cart.stubBefore((ctx) => ctx.ui.title("Cart then continue shopping")),
  )
  .method(Cart.do.continueShopping);
