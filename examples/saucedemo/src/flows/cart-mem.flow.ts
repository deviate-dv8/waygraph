import { engine } from "../../config/waygraph.config.js";
import { Inventory } from "../blocks/saucedemo-web/inventory/inventory.page.block.js";

export const cartMemFlow = engine
  .map()
  .method(Inventory.do.removeFromCart);
