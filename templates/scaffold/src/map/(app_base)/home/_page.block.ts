import { definePageBlock, Trait } from "waygraph";
import type { Home } from "../../../states/demo.states.js";
import { DemoSel } from "./_sel.js";
import { AddItemBlock } from "./_methods/add-item.effect.block.js";
import { RemoveItemBlock } from "./_methods/remove-item.effect.block.js";
import { ClearCartBlock } from "./_methods/clear-cart.method.block.js";
import { AssertHelloBlock } from "./_methods/assert-hello.method.block.js";

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
