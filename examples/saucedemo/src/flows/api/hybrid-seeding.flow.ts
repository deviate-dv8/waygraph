import { engine } from "../../../config/waygraph.config.js";
import { StandardUser } from "../../accounts/accounts.js";
import { Cart } from "../../map/(main)/(app_base)/cart.html/_page.block.js";
import { SeedShopperNote } from "../../map/(main)/(given)/seed-shopper-note.given.block.js";
import { CheckShopperNotes } from "../../map/(main)/(api)/users/check-shopper-notes.api.block.js";
import { Inventory } from "../../map/(main)/(app_base)/inventory.html/_page.block.js";

export const hybridSeedingFlow = engine
  .map({
    as: StandardUser,
    title: "Seed by API, shop in the UI, check by API",
    description: "A note is filed through the API, the shopper adds an item in the browser, and the API confirms the shopper's notes: one story across both.",
    labels: ["hybrid", "api", "seeded"],
    given: [SeedShopperNote],
    memStub: true,
  })
  .gotoPage(Inventory)
  .method(Inventory.do.addToCart)
  .gotoPage(Cart)
  .method(CheckShopperNotes);
