import { engine } from "../../config/waygraph.config.js";
import { Login } from "../blocks/saucedemo-web/nav-login.block.js";
import { LoggedIn } from "../states/checkout.states.js";
import { orderPlacedYap, placingOrder } from "../stubs/finish-order.js";
import { Inventory } from "../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../blocks/saucedemo-web/cart/cart.page.block.js";
import { CheckoutInfo } from "../blocks/saucedemo-web/checkout-step-one/checkout-info.page.block.js";
import { CheckoutOverview } from "../blocks/saucedemo-web/checkout-step-two/checkout-overview.page.block.js";
import { Confirmation } from "../blocks/saucedemo-web/checkout-step-two/order-complete.page.block.js";

/** Full checkout, then the "Back Home" click-based Nav Block returns to the catalogue. */
export const checkoutThenBrowseAgainFlow = engine
  .map({ memStub: true })
  .gotoPage(
    Login.stubBefore((ctx) =>
      ctx.ui.title(
        "Owner: Checkout, then click Back Home (click-based NavBlock demo)",
      ),
    ),
  )
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(Login.do.submitLogin, { lands: LoggedIn })
  .method(Inventory.do.addToCart)
  .gotoPage(Cart.nav)
  .gotoPage(CheckoutInfo.nav)
  .method(CheckoutInfo.do.fillFirstName)
  .method(CheckoutInfo.do.fillLastName)
  .method(CheckoutInfo.do.fillPostalCode)
  .method(CheckoutInfo.do.submit)
  .method(CheckoutOverview.do.finishOrder.stubBefore(placingOrder).stubAfter(orderPlacedYap))
  .gotoPage(Confirmation.do.backHome);
