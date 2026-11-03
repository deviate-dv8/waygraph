import { engine } from "../../config/waygraph.config.js";
import { Login } from "../blocks/saucedemo-web/nav-login.block.js";
import { LoggedIn } from "../states/checkout.states.js";
import { deviceShowcase as d } from "../stubs/device-showcase.js";
import { Inventory } from "../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../blocks/saucedemo-web/cart/cart.page.block.js";

/** Sign in on a phone, shop on a tablet, open the cart in landscape: the device and zoom narration in src/stubs/device-showcase.ts. */
export const deviceShowcaseFlow = engine
  .map({ memStub: true })
  .gotoPage(Login)
  .method(
    Login.do.fillUsername.stubBefore(d.username.before).stubAfter(d.username.after),
  )
  .method(
    Login.do.fillPassword.stubBefore(d.password.before).stubAfter(d.password.after),
  )
  .method(
    Login.do.submitLogin.stubBefore(d.submit.before).stubAfter(d.submit.after),
    { lands: LoggedIn },
  )
  .method(
    Inventory.do.addToCart.stubBefore(d.addToCart.before).stubAfter(d.addToCart.after),
  )
  .gotoPage(
    Cart.nav.stubBefore(d.openCart.before).stubAfter(d.openCart.after),
  );
