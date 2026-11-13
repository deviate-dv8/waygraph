import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../map/(shop)/_page.block.js";
import { orderPlacedYap, placingOrder } from "../../stubs/finish-order.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";
import { CheckoutInfo } from "../../map/(shop)/checkout-step-one.html/_page.block.js";
import { CheckoutOverview } from "../../map/(shop)/checkout-step-two.html/_page.block.js";
import { Confirmation } from "../../map/(shop)/checkout-complete.html/_page.block.js";

/** Full checkout, then the "Back Home" click-based Nav Block returns to the catalogue. */
export const checkoutThenBrowseAgainFlow = engine
  .map({ title: "Check out, then keep browsing", description: "After the order, Back Home returns to the catalogue.", labels: ["checkout"], memStub: true })
  .gotoPage(
    Login.stubBefore((ctx) =>
      ctx.ui.title(
        "Owner: Checkout, then click Back Home (click-based NavBlock demo)",
      ),
    ),
  )
  .method(Login.do.fillUsername)
  .method(Login.do.fillPassword)
  .method(Login.do.submitLogin, { lands: Inventory.checkpoint })
  .method(Inventory.do.addToCart)
  .gotoPage(Cart)
  .gotoPage(CheckoutInfo)
  .method(CheckoutInfo.do.fillFirstName)
  .method(CheckoutInfo.do.fillLastName)
  .method(CheckoutInfo.do.fillPostalCode)
  .method(CheckoutInfo.do.submit)
  .method(CheckoutOverview.do.finishOrder.stubBefore(placingOrder).stub(orderPlacedYap))
  .method(Confirmation.do.backHome);
