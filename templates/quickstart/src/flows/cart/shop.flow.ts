import { engine } from "../../../config/waygraph.config.js";
import { orderPlacedYap, placingOrder } from "../../stubs/finish-order.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";
import { CheckoutInfo } from "../../map/(shop)/checkout-step-one.html/_page.block.js";
import { CheckoutOverview } from "../../map/(shop)/checkout-step-two.html/_page.block.js";

/** Add the selected item, check out and place the order. Starts signed in (run it after loginFlow). */
export const shopFlow = engine
  .map({ title: "Shop and check out", description: "Add the selected item, check out and place the order.", labels: ["cart", "checkout"], memStub: true })
  .gotoPage(Inventory.stubBefore((ctx) => ctx.ui.title("Shop & Checkout")))
  .method(Inventory.do.addToCart)
  .gotoPage(Cart)
  .gotoPage(CheckoutInfo)
  .method(CheckoutInfo.do.fillFirstName)
  .method(CheckoutInfo.do.fillLastName)
  .method(CheckoutInfo.do.fillPostalCode)
  .method(CheckoutInfo.do.submit)
  .method(CheckoutOverview.do.finishOrder.stubBefore(placingOrder).stub(orderPlacedYap));
