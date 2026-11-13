import { engine } from "../../../config/waygraph.config.js";
import { loginFlow } from "../auth/login.flow.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";

/** Add every item, then remove them all (the bulk Methods). */
export const cartBulkEpisode = engine
  .map({ title: "Bulk add and remove", description: "Every Add clicked, then every Remove." })
  .gotoPage(Inventory.stubBefore((ctx) => ctx.ui.title("Cart bulk add/remove all")))
  .method(Inventory.do.addAllToCart)
  .method(Inventory.do.removeAllFromCart);

export const cartBulkFlow = engine
  .map({ title: "Add everything, remove everything", description: "The bulk Methods: every Add clicked, then every Remove.", labels: ["cart"], memStub: true })
  .flow(loginFlow)
  .flow(cartBulkEpisode);
