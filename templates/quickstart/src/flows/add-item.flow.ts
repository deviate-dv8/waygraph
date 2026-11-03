import { engine } from "../../config/waygraph.config.js";
import { SaucedemoKeys } from "../states/checkout.mem-keys.js";
import { StandardUser } from "../accounts/accounts.js";
import { Inventory } from "../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { Cart } from "../blocks/saucedemo-web/cart/cart.page.block.js";

/**
 * One flow for every item: its input is the item. `waygraph run addItemFlow --input '{"id":"sauce-labs-bike-light","name":"Sauce Labs Bike Light"}'`,
 * or a list to add several, one episode each.
 */
export const addItemFlow = engine
  .map({ as: StandardUser, input: SaucedemoKeys.selectedItem, memStub: true })
  .gotoPage(Inventory.nav)
  .method(Inventory.do.addToCart)
  .gotoPage(Cart.nav);
