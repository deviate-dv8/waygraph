import { engine } from "../../config/waygraph.config.js";
import { loginFlow } from "./login.flow.js";
import { Inventory } from "../blocks/saucedemo-web/inventory/inventory.page.block.js";

/** Add every item, then remove them all (the bulk Methods). */
export const cartBulkEpisode = engine
  .map()
  .method(
    Inventory.do.addAllToCart.stubBefore((ctx) =>
      ctx.ui.title("Cart bulk add/remove all"),
    ),
  )
  .method(Inventory.do.removeAllFromCart);

export const cartBulkFlow = engine
  .map({ memStub: true })
  .flow(loginFlow)
  .flow(cartBulkEpisode);
