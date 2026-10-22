import { engine } from "../../config/waygraph.config.js";
import { DemoSel } from "../map/(app_base)/home/_sel.js";
import { NavHomeBlock } from "../map/(app_base)/home/_nav.block.js";
import { AddItemBlock } from "../map/(app_base)/home/_methods/add-item.effect.block.js";
import { AssertItemAddedBlock } from "../map/(app_base)/home/_methods/assert-item-added.method.block.js";
import { RemoveItemBlock } from "../map/(app_base)/home/_methods/remove-item.effect.block.js";
import { ClearCartBlock } from "../map/(app_base)/home/_methods/clear-cart.method.block.js";
import "../states/demo.mem-stubs.js";
import "../map/(app_base)/home/_page.block.js";

// `memStub: true` fills SelectedItem (alpha) from src/states/demo.mem-stubs.ts; --data overrides it.
const AddShown = AddItemBlock.stubBefore((ctx) => {
  ctx.ring("add", { selector: DemoSel.catalog, label: "Catalog" });
})
  .stubAfter((ctx) => {
    ctx.ring("cart", {
      selector: DemoSel.cartCount,
      label: "AC · item in cart",
      detail: "Cart count bumped after Add.",
      tag: "AC",
      duration: true,
    });
  })
  .stubOnError((ctx) => {
    ctx.ring("cart", { selector: DemoSel.cartCount, label: "Cart at failure", tag: "FAIL" });
  });

const RemoveShown = RemoveItemBlock.stubAfter((ctx) => {
  ctx.ring("cart", { selector: DemoSel.cartCount, label: "Cart count", duration: true });
});

const ClearShown = ClearCartBlock.stubBefore((ctx) => {
  ctx.ring("clear", { selector: DemoSel.clear, label: "Clear cart" });
}).stubAfter((ctx) => {
  ctx.ring("cart", { selector: DemoSel.cartCount, label: "Empty cart", duration: true });
});

export const shopFlow = engine
  .map()
  .start()
  .gotoPage(NavHomeBlock)
  .method(AddShown)
  .assert(AssertItemAddedBlock)
  .method(RemoveShown)
  .method(AddShown)
  .method(ClearShown)
  .end({ title: "Scaffold: Shop (Effect + clear)", sessionReset: true, memStub: true });
