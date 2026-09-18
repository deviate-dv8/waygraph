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
    ctx.landscape();
    ctx.todos(
      "saucedemo",
      [
        { id: "login-user", text: "Enter username", done: true },
        { id: "login-pass", text: "Enter password", done: true },
        { id: "login-submit", text: "Tap Login", done: true },
        { id: "cart-find", text: "Find the product", done: true },
        { id: "cart-add", text: "Add to cart", done: true },
        { id: "cart-open", text: "Open cart" },
      ],
      { title: "Device showcase", index: 5 },
    );
    ctx.zoom(1.4);
    ctx.zoomOut(false);
    ctx.highlights({
      cart: {
        selector: ".shopping_cart_link",
        label: "Cart",
        detail: "Open cart",
        focus: true,
        color: "#c9a6ff",
        zoomOut: false,
        followMouse: false,
        weight: "bold",
        gesture: "tap",
      },
    });
  },
  stubAfter: (ctx: StubCtx) => {
    ctx.banner("Your cart · desktop");
    ctx.clearDevice();
    ctx.hideTodos();
    ctx.zoomOut(true);
    ctx.ring("items", {
      selector: InventorySel.cartItem,
      label: "Cart items",
      detail: "Product landed in cart",
      focus: true,
      color: "#86efac",
      zoomOut: true,
      followMouse: false,
      duration: true,
    });
  },
});
