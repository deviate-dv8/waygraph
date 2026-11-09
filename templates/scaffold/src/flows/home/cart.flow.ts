import { engine } from "#config/waygraph.config";
import { HomePage } from "#map/(app_base)/home/_page.block";
import { DemoSel } from "#map/(app_base)/home/_sel";
import { HomeRead } from "#map/(app_base)/home/_reads";

// SelectedItem (alpha) comes from src/states/demo.mem-stubs.ts; --data overrides it.
const AddShown = HomePage.do.addItem.stubBefore((ctx) => {
  ctx.ui.ring("add", { selector: DemoSel.catalog, label: "Catalog" });
})
  .stubAfter((ctx) => {
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

const RemoveShown = HomePage.do.removeItem.stubAfter((ctx) => {
  ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "Cart count", duration: true });
});

const ClearShown = HomePage.do.clearCart.stubBefore((ctx) => {
  ctx.ui.ring("clear", { selector: DemoSel.clear, label: "Clear cart" });
}).stubAfter((ctx) => {
  ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "Empty cart", duration: true });
});

export const homeCartFlow = engine
  .map()
  .gotoPage(
    HomePage.nav.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Shop (add + clear)");
    }),
  )
  .method(AddShown, { expect: [HomeRead.cartCount.is(1)] })
  .method(RemoveShown)
  .method(AddShown)
  .method(ClearShown);
