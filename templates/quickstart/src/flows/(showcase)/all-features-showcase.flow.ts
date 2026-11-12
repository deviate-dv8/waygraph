import { pane } from "waygraph";
import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../blocks/saucedemo-web/nav-login.block.js";
import { InventoryPage } from "../../states/checkout.states.js";
import { allFeaturesShowcase as d } from "../../stubs/all-features-showcase.js";
import { Inventory } from "../../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { ProblemUser } from "../../accounts/accounts.js";
import { Cart } from "../../blocks/saucedemo-web/cart/cart.page.block.js";

const Main = pane("main");
const Guest = pane("guest", { as: ProblemUser });

/**
 * Every waygraph feature in one demo: a phone, a tablet and landscape with zoom and the todo dock (narration in
 * src/stubs/all-features-showcase.ts), then split view: a second shopper's pane opens beside the first, and closes.
 */
export const allFeaturesShowcaseFlow = engine
  .map({ memStub: true, panes: [Main, Guest] })
  .in(Main)
  .gotoPage(Login)
  .method(
    Login.do.fillUsername.stubBefore(d.username.before).stubAfter(d.username.after),
  )
  .method(
    Login.do.fillPassword.stubBefore(d.password.before).stubAfter(d.password.after),
  )
  .method(
    Login.do.submitLogin.stubBefore(d.submit.before).stubAfter(d.submit.after),
    { lands: InventoryPage },
  )
  .method(
    Inventory.do.addToCart.stubBefore(d.addToCart.before).stubAfter(d.addToCart.after),
  )
  .gotoPage(
    Cart.stubBefore(d.openCart.before).stubAfter(d.openCart.after),
  )
  .in(Guest)
  .gotoPage(Inventory)
  .gotoPage(Cart)
  .in(Main)
  .close(Guest);
