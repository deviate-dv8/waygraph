import { engine } from "#config/waygraph.config";
import { HomePage } from "#map/(main)/(app_base)/home/_page.block";
import { DemoSel } from "#map/(main)/(app_base)/home/_sel";

// The selected item (alpha) is the mem key's own stub (src/states/demo.mem-keys.ts); --data overrides it.
const AddShown = HomePage.do.addItem.stubBefore((ctx) => {
  ctx.ui.ring("add", { selector: DemoSel.catalog, label: "Catalog" });
})
  .stub((ctx) => {
    ctx.ui.ring("cart", {
      selector: DemoSel.cartCount,
      label: "AC · item in cart",
      detail: "Cart count bumped after Add.",
      tag: "AC",
      duration: true,
    });
  })
  .stubOnError((ctx) => {
    ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "Cart at failure", tag: "FAIL" });
  });

const RemoveShown = HomePage.do.removeItem.stub((ctx) => {
  ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "Cart count", duration: true });
});

const ClearShown = HomePage.do.clearCart.stubBefore((ctx) => {
  ctx.ui.ring("clear", { selector: DemoSel.clear, label: "Clear cart" });
}).stub((ctx) => {
  ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "Empty cart", duration: true });
});

export const homeCartFlow = engine
  .map({ title: "Shop: add, remove, clear", description: "Add an item, remove it, add it again, then clear the cart.", labels: ["shop"] })
  .gotoPage(
    HomePage.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Shop (add + clear)");
    }),
  )
  .method(AddShown, { expect: [HomePage.read.cartCount.is(1)] })
  .method(RemoveShown)
  .method(AddShown)
  .method(ClearShown);
