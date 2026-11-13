import { engine } from "../../../config/waygraph.config.js";
import { StandardUser } from "../../accounts/accounts.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";

export const cartContinueFlow = engine
  .map({ as: StandardUser, title: "Continue shopping", description: "From the cart, back to the catalogue.", labels: ["cart"] })
  .gotoPage(
    Cart.stubBefore((ctx) => ctx.ui.title("Cart then continue shopping")),
  )
  .method(Cart.do.continueShopping);
