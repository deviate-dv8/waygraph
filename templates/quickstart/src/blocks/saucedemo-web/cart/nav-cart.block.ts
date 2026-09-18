import { defineNavClickBlock, Trait } from "waygraph";
import type { StubCtx } from "waygraph";
import type { CartPage } from "../../../states/checkout.states.js";
import { InventorySel } from "../inventory/methods/inventory-items.js";

/**
 * Kind: Nav
 * Helper: defineNavClickBlock
 * Route: saucedemo-web/cart/  (= /cart.html)
 *
 * click, not url - header cart link from inventory-adjacent pages.
 */
export const NavCartBlock = defineNavClickBlock<CartPage>({
  name: "nav-cart",
  description: "Clicks the cart link in the header.",
  checkpoint: "CartPage",
  click: ".shopping_cart_link",
  verify: [Trait.url({ pathname: "/cart.html" })],
  stubBefore: (ctx: StubCtx) => {
    ctx.title("Open cart · landscape");
    // Device showcase: rotate tablet to landscape before the cart tap.
    ctx.landscape();
    ctx.todoId("saucedemo-cart");
    ctx.todos([
      { id: "cart-find", text: "Find the product" },
      { id: "cart-add", text: "Add to cart" },
      { id: "cart-open", text: "Open cart" },
    ]);
    ctx.todoIndex(2);
    ctx.zoom(1.4);
    ctx.zoomOut(false);
    ctx.highlights({
      cart: {
        selector: ".shopping_cart_link",
        label: "Cart",
        detail: "Zoom cart chrome",
        focus: true,
        color: "#c9a6ff",
        zoom: 1.55,
        zoomOut: false,
        followMouse: false,
        weight: "bold",
        gesture: "tap",
      },
    });
  },
  stubAfter: (ctx: StubCtx) => {
    ctx.banner("Your cart · desktop");
    // Showcase finale: back to desktop.
    ctx.clearDevice();
    ctx.zoomOut(false);
    ctx.ring("items", {
      selector: InventorySel.cartItem,
      label: "Cart items",
      detail: "Product landed in cart",
      focus: true,
      color: "#86efac",
      zoom: 1.4,
      followMouse: false,
      duration: true,
    });
  },
});
