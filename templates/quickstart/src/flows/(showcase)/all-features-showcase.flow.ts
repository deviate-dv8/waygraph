import { pane } from "waygraph";
import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../map/(shop)/_page.block.js";
import { allFeaturesShowcase as d } from "../../stubs/all-features-showcase.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { ProblemUser } from "../../accounts/accounts.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";

const Main = pane("main");
const Guest = pane("guest", { as: ProblemUser });

/**
 * Every waygraph feature in one demo: a phone, a tablet and landscape with zoom and the todo dock (narration in
 * src/stubs/all-features-showcase.ts), then split view: a second shopper's pane opens beside the first, and closes.
 */
export const allFeaturesShowcaseFlow = engine
  .map({ title: "Every feature in one demo", description: "Phone, tablet and landscape, zoom, the checklist and a split view with two shoppers.", labels: ["showcase"], memStub: true, panes: [Main, Guest] })
  .in(Main)
  .gotoPage(Login)
  .method(
    Login.do.fillUsername.stubBefore(d.username.before).stub(d.username.after),
  )
  .method(
    Login.do.fillPassword.stubBefore(d.password.before).stub(d.password.after),
  )
  .method(
    Login.do.submitLogin.stubBefore(d.submit.before).stub(d.submit.after),
    { lands: Inventory.checkpoint },
  )
  .method(
    Inventory.do.addToCart.stubBefore(d.addToCart.before).stub(d.addToCart.after),
  )
  .gotoPage(
    Cart.stubBefore(d.openCart.before).stub(d.openCart.after),
  )
  .in(Guest)
  .gotoPage(Inventory)
  .gotoPage(Cart)
  .in(Main)
  .close(Guest);
