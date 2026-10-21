import { Engine } from "waygraph";
import config from "../../config/waygraph.config.js";
import { DemoSel } from "../map/(app_base)/home/_sel.js";
import { NavHomeBlock } from "../map/(app_base)/home/_nav.block.js";
import { AddItemBlock } from "../map/(app_base)/home/_methods/add-item.effect.block.js";
import { AssertItemAddedBlock } from "../map/(app_base)/home/_methods/assert-item-added.method.block.js";
import { RemoveItemBlock } from "../map/(app_base)/home/_methods/remove-item.effect.block.js";
import { ClearCartBlock } from "../map/(app_base)/home/_methods/clear-cart.method.block.js";
import "../states/demo.mem-stubs.js";
import "../map/(app_base)/home/_page.block.js";

const engine = new Engine(config);

// `memStub: true` fills SelectedItem (alpha) from src/states/demo.mem-stubs.ts; --data overrides it.
const AddItemShown = AddItemBlock.stubAfter((ctx) => {
  ctx.ring("cart", {
    selector: DemoSel.cartCount,
    label: "AC · item in cart",
    detail: "Cart count bumped after Add.",
    tag: "AC",
    duration: true,
  });
});

export const shopFlow = engine
  .map()
  .start()
  .gotoPage(NavHomeBlock)
  .method(AddItemShown)
  .assert(AssertItemAddedBlock)
  .method(RemoveItemBlock)
  .method(AddItemShown)
  .method(ClearCartBlock)
  .end({ title: "Scaffold: Shop (Effect + clear)", sessionReset: true, memStub: true });
