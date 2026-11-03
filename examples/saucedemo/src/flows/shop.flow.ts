import { engine } from "../../config/waygraph.config.js";
import { orderPlacedYap, placingOrder } from "../stubs/finish-order.js";
import { Inventory } from "../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../blocks/saucedemo-web/cart/cart.page.block.js";
import { CheckoutInfo } from "../blocks/saucedemo-web/checkout-step-one/checkout-info.page.block.js";
import { CheckoutOverview } from "../blocks/saucedemo-web/checkout-step-two/checkout-overview.page.block.js";

/** Add the selected item, check out and place the order. Starts signed in (run it after loginFlow). */
export const shopFlow = engine
  .map({ memStub: true })
  .method(Inventory.do.addToCart.stubBefore((ctx) => ctx.ui.title("Shop & Checkout")))
  .gotoPage(Cart.nav)
  .gotoPage(CheckoutInfo.nav)
  .method(CheckoutInfo.do.fillFirstName)
  .method(CheckoutInfo.do.fillLastName)
  .method(CheckoutInfo.do.fillPostalCode)
  .method(CheckoutInfo.do.submit)
  .method(CheckoutOverview.do.finishOrder.stubBefore(placingOrder).stubAfter(orderPlacedYap));
