import { engine } from "../../../config/waygraph.config.js";
import { StandardUser } from "../../accounts/accounts.js";
import { Inventory } from "../../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../../blocks/saucedemo-web/cart/cart.page.block.js";

/** The standard user, already signed in, puts an item in the cart: no login steps of its own. */
export const cartAsAccountFlow = engine
  .map({ as: StandardUser, memStub: true })
  .gotoPage(Inventory)
  .method(Inventory.do.addToCart)
  .gotoPage(Cart);
