import { definePageBlock, Trait } from "waygraph";
import type { Home } from "../../states/demo.states.js";
import { DemoSel } from "./demo-sel.js";
import { AddItemBlock } from "./methods/add-item.effect.block.js";
import { RemoveItemBlock } from "./methods/remove-item.effect.block.js";
import { ClearCartBlock } from "./methods/clear-cart.method.block.js";
import { AssertHelloBlock } from "./methods/assert-hello.method.block.js";

/**
 * Kind: Page
 * Helper: definePageBlock
 * Route: demo-web/
 *
 * Hub for the offline home screen. Methods hang here for docs/auto grouping;
 * edges in flows still reference the method Blocks directly.
 * Arrival-only (nav-home already landed on Home).
 */
export const HomePageBlock = definePageBlock<Home>({
  name: "page-home",
  description: "Offline home hub - add/remove effects, clear, assert-hello.",
  checkpoint: "Home",
  verify: [Trait.visible(DemoSel.catalog)],
  methods: {
    addItem: () => AddItemBlock,
    removeItem: () => RemoveItemBlock,
    clearCart: () => ClearCartBlock,
    assertHello: () => AssertHelloBlock,
  },
});
