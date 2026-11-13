import { defineApiBlock, MemKey } from "waygraph";
import { engine } from "../../../config/waygraph.config.js";
import { StandardUser } from "../../accounts/accounts.js";
import { Cart } from "../../blocks/saucedemo-web/cart/cart.page.block.js";
import { Inventory } from "../../blocks/saucedemo-web/inventory/inventory.page.block.js";
import { CartPage, InventoryPage } from "../../states/checkout.states.js";

/** The id the API gave the seeded record, kept for the steps after it. */
const SeededId = new MemKey<number>("seeded.id");

/** Before the shopper arrives, the back office files a note for them: one POST, as a test's setup would. */
const SeedShopperNote = defineApiBlock({
  name: "seed-shopper-note",
  description: "Files a note for the shopper through the API, before they shop.",
  method: "POST",
  from: InventoryPage,
  to: InventoryPage,
  call: async ({ request, mem }) => {
    const response = await request.post("https://jsonplaceholder.typicode.com/posts", {
      data: { title: "Welcome back, standard_user", body: "Free shipping on the first order.", userId: 1 },
    });
    mem.set(SeededId, ((await response.json()) as { id: number }).id);
    return response;
  },
});

/** After the cart is filled: the shopper's notes are still there. */
const CheckShopperNotes = defineApiBlock({
  name: "check-shopper-notes",
  description: "Asks the API for the shopper's notes: the seeded one's author still has them.",
  from: CartPage,
  to: CartPage,
  call: ({ request }) => request.get("https://jsonplaceholder.typicode.com/users/1/posts"),
});

export const hybridSeedingFlow = engine
  .map({
    as: StandardUser,
    title: "Seed by API, shop in the UI, check by API",
    description: "A note is filed through the API, the shopper adds an item in the browser, and the API confirms the shopper's notes: one story across both.",
    labels: ["hybrid", "api"],
    memStub: true,
  })
  .gotoPage(Inventory)
  .method(
    SeedShopperNote.stubAfter((ctx) => {
      ctx.ui.caption("The note is filed: this is what was sent and what came back");
      ctx.ui.showCalls();
    }),
  )
  .method(Inventory.do.addToCart)
  .gotoPage(Cart)
  .method(CheckShopperNotes);
