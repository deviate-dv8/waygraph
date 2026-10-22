import { definePageBlock, Trait } from "waygraph";
import type { LoggedIn } from "../../../states/checkout.states.js";
import { AddToCartBlock } from "./methods/add-to-cart.effect.block.js";
import { RemoveFromCartBlock } from "./methods/remove-from-cart.effect.block.js";
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
 * add/remove, open detail) hang off this page; DOM strings live in
 * InventorySel. Arrival-only (no url/click) - submit-login already resolved
 * to LoggedIn. Cart Effects/Methods use In Checkpoint<string> (from: "*") so
 * auto still offers them after leave/return - menu follows live DOM buttons.
 */
export const InventoryPageBlock = definePageBlock<LoggedIn>({
  name: "page-inventory",
  description:
    "Inventory catalog hub - per-item and bulk add/remove, open item detail.",
  checkpoint: "LoggedIn",
  verify: [
    Trait.url({ pathname: "/inventory.html" }),
    Trait.visible(InventorySel.list),
  ],
  methods: {
    addToCart: () => AddToCartBlock,
    removeFromCart: () => RemoveFromCartBlock,
    addAllToCart: () => AddAllToCartBlock,
    removeAllFromCart: () => RemoveAllFromCartBlock,
    openDetail: () => NavItemDetailBlock,
  },
});
