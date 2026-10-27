import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { StandardUser } from "../accounts/accounts.js";
import { NavInventoryBlock } from "../blocks/saucedemo-web/inventory/nav-inventory.block.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";

/** The standard user, already signed in, puts an item in the cart: no login steps of its own. */
export const cartAsAccountFlow = engine
  .map({ as: StandardUser, memStub: true })
  .gotoPage(NavInventoryBlock)
  .method(AddToCartBlock)
  .gotoPage(NavCartBlock)
  .end();
