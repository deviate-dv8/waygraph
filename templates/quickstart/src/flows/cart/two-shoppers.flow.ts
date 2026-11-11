import { engine } from "../../../config/waygraph.config.js";
import { ProblemUser, StandardUser } from "../../accounts/accounts.js";
import { Inventory } from "../../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../../blocks/saucedemo-web/cart/cart.page.block.js";
import { Cart as CartShows } from "../../states/checkout.reads.js";

/** Two shoppers side by side, each with a cart of their own: what one adds, the other's cart doesn't have. */
export const twoShoppersFlow = engine
  .map({ memStub: true, panes: { standard: { as: StandardUser }, problem: { as: ProblemUser } } })
  .in("standard").gotoPage(Inventory.nav).method(Inventory.do.addToCart)
  .in("problem").gotoPage(Cart.nav, { expect: [CartShows.lines.passes((lines) => lines.length === 0, "an empty cart")] })
  .in("standard").gotoPage(Cart.nav, { expect: [CartShows.lines.passes((lines) => lines.length === 1, "one item")] });
