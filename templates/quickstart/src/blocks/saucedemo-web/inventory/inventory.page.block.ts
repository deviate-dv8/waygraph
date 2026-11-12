import { definePageBlock, Trait } from "waygraph";
import { InventoryPage } from "../../../states/checkout.states.js";
import { AddToCartBlock } from "./methods/add-to-cart.method.block.js";
import { RemoveFromCartBlock } from "./methods/remove-from-cart.method.block.js";
import { AddAllToCartBlock } from "./methods/add-all-to-cart.method.block.js";
import { RemoveAllFromCartBlock } from "./methods/remove-all-from-cart.method.block.js";
import { NavItemDetailBlock } from "./nav-item-detail.block.js";
import { InventorySel } from "./methods/inventory-items.js";

/**
 * Kind: Page
 * Helper: definePageBlock
 * Route: saucedemo-web/inventory/  (= /inventory.html)
 *
 * Hub for the inventory screen after login. Methods (per-item + bulk
 * add/remove, open detail, log out) hang off this page; DOM strings live in
 * InventorySel. Opened by NavInventoryBlock (its nav), or arrived at by
 * submit-login. Cart Methods use In Checkpoint<string> (from: "*") so
 * auto still offers them after leave/return - menu follows live DOM buttons.
 */
export const Inventory = definePageBlock({
  name: "page-inventory",
  description:
    "Inventory catalog hub - per-item and bulk add/remove, open item detail.",
  checkpoint: InventoryPage,
  screenshot: true,
  url: "/inventory.html",
  verify: [Trait.url({ pathname: "/inventory.html" }), Trait.visible(InventorySel.list)],
  read: (ctx) => ({
      items: ctx.page.list(InventorySel.card, (row) => ({
        name: row.text(InventorySel.name),
        price: row.number(".inventory_item_price"),
        inCart: row.visible(InventorySel.removeBtnPrefix),
      })),
      sort: ctx.page.value(".product_sort_container"),
    }),
  readAs: "catalog",
  do: () => ({ addToCart: AddToCartBlock, removeFromCart: RemoveFromCartBlock, addAllToCart: AddAllToCartBlock, removeAllFromCart: RemoveAllFromCartBlock, openDetail: NavItemDetailBlock })
});
