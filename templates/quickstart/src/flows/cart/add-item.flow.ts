import { engine } from "../../../config/waygraph.config.js";
import { SaucedemoKeys } from "../../states/checkout.mem-keys.js";
import { StandardUser } from "../../accounts/accounts.js";
import { Inventory } from "../../map/(shop)/inventory.html/_page.block.js";
import { Cart } from "../../map/(shop)/cart.html/_page.block.js";

/**
 * One flow for every item: its input is the item. `waygraph run addItemFlow --input '{"id":"sauce-labs-bike-light","name":"Sauce Labs Bike Light"}'`,
 * or a list to add several, one episode each.
 */
export const addItemFlow = engine
  .map({ title: "Add one item", description: "One flow for any item: its input is the item.", labels: ["cart"], as: StandardUser, input: SaucedemoKeys.selectedItem, memStub: true })
  .gotoPage(Inventory)
  .method(Inventory.do.addToCart)
  .gotoPage(Cart);
