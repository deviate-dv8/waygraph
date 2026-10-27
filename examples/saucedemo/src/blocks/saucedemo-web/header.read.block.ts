import { defineReadBlock } from "waygraph/beta";
import { Header } from "../../states/checkout.reads.js";
import { InventorySel } from "./inventory/methods/inventory-items.js";

/**
 * Kind: Read (beta)
 * Helper: defineReadBlock
 * Route: saucedemo-web/  (every signed-in page)
 *
 * The header every page shares: the page title and how many items are in the cart (0 when the badge is not shown).
 */
export const HeaderReadBlock = defineReadBlock({
  name: "read-header",
  description: "The page title and the cart count.",
  instruction: {
    read: (ctx) =>
      Header({
        title: ctx.page.text(".title"),
        cartCount: ctx.page.fn(async (page) => {
          const badge = page.locator(InventorySel.cartBadge);
          return (await badge.count()) ? Number(await badge.first().innerText()) : 0;
        }),
      }),
  },
});
