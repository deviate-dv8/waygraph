import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { RemoveFromCartBlock } from "../blocks/saucedemo-web/inventory/methods/remove-from-cart.effect.block.js";

export const cartMemFlow = engine
  .map()
  .start()
  .method(RemoveFromCartBlock)
  .end();
