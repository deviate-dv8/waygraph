import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { SaucedemoKeys } from "../states/checkout.mem-keys.js";
import { StandardUser } from "../accounts/accounts.js";
import { NavInventoryBlock } from "../blocks/saucedemo-web/inventory/nav-inventory.block.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";

/**
 * One flow for every item: its input is the item. `waygraph run addItemFlow --input '{"id":"sauce-labs-bike-light","name":"Sauce Labs Bike Light"}'`,
 * or a list to add several, one episode each.
 */
export const addItemFlow = engine
  .map({ as: StandardUser, input: SaucedemoKeys.selectedItem, memStub: true })
  .gotoPage(NavInventoryBlock)
  .method(AddToCartBlock)
  .gotoPage(NavCartBlock)
  .end();
