import { definePageBlock, Trait } from "waygraph";
import { NavHomeBlock } from "./_nav.block.js";
import { Home } from "../../../states/demo.states.js";
import { DemoSel } from "./_sel.js";
import { AddItemBlock } from "./_methods/add-item.method.block.js";
import { RemoveItemBlock } from "./_methods/remove-item.method.block.js";
import { ClearCartBlock } from "./_methods/clear-cart.method.block.js";
import { ExpectHelloBlock } from "./_expect/hello.expect.block.js";
import { ExpectItemAddedBlock } from "./_expect/item-added.expect.block.js";

export const HomePage = definePageBlock({
  name: "page-home",
  description: "Offline home hub - add/remove effects, clear; expects hello and item-added.",
  checkpoint: Home,
  screenshot: true,
  nav: NavHomeBlock,
  verify: [Trait.visible(DemoSel.catalog)],
  methods: {
    addItem: () => AddItemBlock,
    removeItem: () => RemoveItemBlock,
    clearCart: () => ClearCartBlock,
  },
  expects: {
    hello: () => ExpectHelloBlock,
    itemAdded: () => ExpectItemAddedBlock,
  },
});
