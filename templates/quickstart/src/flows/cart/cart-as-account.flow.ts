import { engine } from "../../../config/waygraph.config.js";
import { StandardUser } from "../../accounts/accounts.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";

/** The standard user, already signed in, puts an item in the cart: no login steps of its own. */
export const cartAsAccountFlow = engine
  .map({ title: "Cart as a signed-in account", description: "A flow as an account starts signed in, with no login steps of its own.", labels: ["cart"], as: StandardUser, memStub: true })
  .gotoPage(Inventory)
  .method(Inventory.do.addToCart)
  .gotoPage(Cart);
