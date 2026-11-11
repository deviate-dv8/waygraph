import { pane } from "waygraph";
import { engine } from "../../../config/waygraph.config.js";
import { ProblemUser, StandardUser } from "../../accounts/accounts.js";
import { Inventory } from "../../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../../blocks/saucedemo-web/cart/cart.page.block.js";
import { } from "../../states/checkout.reads.js";

const Standard = pane("standard", { as: StandardUser });
const Problem = pane("problem", { as: ProblemUser });

/**
 * Two shoppers, each with a cart of their own: the standard shopper alone, then the problem shopper beside them, whose
 * cart doesn't have what the first added; then back to the standard shopper alone.
 */
export const twoShoppersFlow = engine
  .map({ memStub: true, panes: [Standard, Problem] })
  .in(Standard).gotoPage(Inventory.nav).method(Inventory.do.addToCart)
  .in(Problem).gotoPage(Inventory.nav).gotoPage(Cart.nav, { expect: [Cart.read.lines.passes((lines) => lines.length === 0, "an empty cart")] })
  .in(Standard).gotoPage(Cart.nav, { expect: [Cart.read.lines.passes((lines) => lines.length === 1, "one item")] })
  .close(Problem)
  .gotoPage(Inventory.nav);
