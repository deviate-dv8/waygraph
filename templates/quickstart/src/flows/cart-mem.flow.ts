import { engine } from "../../config/waygraph.config.js";
import { RemoveFromCartBlock } from "../blocks/saucedemo-web/inventory/methods/remove-from-cart.effect.block.js";

export const cartMemFlow = engine
  .map()
  .method(RemoveFromCartBlock);
