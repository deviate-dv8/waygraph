import { engine } from "../../config/waygraph.config.js";
import { loginFlow } from "./login.flow.js";
import { AddAllToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-all-to-cart.method.block.js";
import { RemoveAllFromCartBlock } from "../blocks/saucedemo-web/inventory/methods/remove-all-from-cart.method.block.js";

/** Add every item, then remove them all (the bulk Methods). */
export const cartBulkEpisode = engine
  .map()
  .method(
    AddAllToCartBlock.stubBefore((ctx) =>
      ctx.ui.title("Cart bulk add/remove all"),
    ),
  )
  .method(RemoveAllFromCartBlock);

export const cartBulkFlow = engine
  .map({ memStub: true })
  .flow(loginFlow)
  .flow(cartBulkEpisode);
