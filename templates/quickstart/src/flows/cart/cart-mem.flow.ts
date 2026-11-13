import { engine } from "../../../config/waygraph.config.js";
import { StandardUser } from "../../accounts/accounts.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";

export const cartMemFlow = engine
  .map({ as: StandardUser, title: "Remove the selected item", description: "The item named in mem is taken out of the cart.", labels: ["cart"] })
  .gotoPage(Inventory)
  .method(Inventory.do.removeFromCart);
