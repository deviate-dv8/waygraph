import { pane } from "waygraph";
import { engine } from "../../../config/waygraph.config.js";
import { ProblemUser, StandardUser } from "../../accounts/accounts.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";

const Standard = pane("standard", { as: StandardUser });
const Problem = pane("problem", { as: ProblemUser });

/**
 * Two shoppers, each with a cart of their own: the standard shopper alone, then the problem shopper beside them, whose
 * cart doesn't have what the first added; then back to the standard shopper alone.
 */
export const twoShoppersFlow = engine
  .map({ title: "Two shoppers, two carts", description: "Two people in one flow: each has a cart of their own.", labels: ["cart", "panes"], memStub: true, panes: [Standard, Problem] })
  .in(Standard).gotoPage(Inventory).method(Inventory.do.addToCart)
  .in(Problem).gotoPage(Inventory).gotoPage(Cart, { expect: [Cart.check("an empty cart", ({ lines }) => lines.length === 0)] })
  .in(Standard).gotoPage(Cart, { expect: [Cart.check("one item", ({ lines }) => lines.length === 1)] })
  .close(Problem)
  .gotoPage(Inventory);
