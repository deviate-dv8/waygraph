import type { StubCtx } from "waygraph";
import { SaucedemoKeys } from "../states/checkout.mem-keys.js";
import { LoginSel } from "../blocks/saucedemo-web/methods/login.sel.js";
import { CartSel } from "../blocks/saucedemo-web/cart/cart.sel.js";
import { InventorySel } from "../blocks/saucedemo-web/inventory/methods/inventory-items.js";

const PRODUCT_ID = "sauce-labs-backpack";

/** The six-step checklist of the device showcase; `done` is how many are ticked, `index` the highlighted one. */
function checklist(done: number, index: number) {
  const steps = [
    "Enter username",
    "Enter password",
    "Tap Login",
    "Find the product",
    "Add to cart",
    "Open cart",
  ];
  const ids = [
    "login-user",
    "login-pass",
    "login-submit",
    "cart-find",
    "cart-add",
    "cart-open",
  ];
  return [
    ids.map((id, i) => ({
      id,
      text: steps[i]!,
      ...(i < done ? { done: true } : {}),
    })),
    { title: "Device showcase", index },
  ] as const;
}

/** Narration for the device showcase flow: phone login, tablet shelf, landscape cart. Each is a stub to chain on its Block. */
export const deviceShowcase = {
  username: {
    before: (ctx: StubCtx) => {
      ctx.ui.title("Signing in · mobile");
      ctx.ui.device("mobile");
      ctx.ui.orientation("portrait");
      ctx.ui.todos("saucedemo", ...checklist(0, 0));
      ctx.ui.zoom(1.35);
      const fromMem = ctx.mem?.get(SaucedemoKeys.credentials)?.username;
      ctx.ui.ring("username", {
        selector: LoginSel.username,
        label: "Username",
        detail: fromMem
          ? `tone: info (blue) - mem ${fromMem}`
          : "tone: info (blue)",
        tone: "info",
        todo: "login-user",
        focus: true,
        zoom: 1.4,
      });
    },
    after: (ctx: StubCtx) => {
      ctx.ui.todos("saucedemo", ...checklist(1, 1));
    },
  },
  password: {
    before: (ctx: StubCtx) => {
      ctx.ui.ring("password", {
        selector: LoginSel.password,
        label: "Password",
        detail: "tone: planned (blue)",
        todo: "login-pass",
        tone: "planned",
        focus: true,
        zoom: 1.4,
      });
    },
    after: (ctx: StubCtx) => {
      ctx.ui.todos("saucedemo", ...checklist(2, 2));
    },
  },
  submit: {
    before: (ctx: StubCtx) => {
      ctx.ui.ring("submit", {
        selector: LoginSel.loginButton,
        label: "Login",
        detail: "tone: warning (yellow)",
        todo: "login-submit",
        tone: "warning",
        focus: true,
        zoom: 1.55,
        weight: "bold",
        gesture: "tap",
      });
    },
    after: (ctx: StubCtx) => {
      ctx.ui.title("Inventory · landscape");
      ctx.ui.orientation("landscape");
      ctx.ui.todos("saucedemo", ...checklist(3, 3));
      ctx.ui.ring("shelf", {
        selector: ".inventory_list",
        label: "Product shelf",
        detail: "tone: success (green) - ready to shop",
        tone: "success",
        focus: true,
        zoom: 1.25,
        duration: true,
      });
    },
  },
  addToCart: {
    before: (ctx: StubCtx) => {
      ctx.ui.title("Pick a product · tablet");
      ctx.ui.device("tablet");
      ctx.ui.orientation("portrait");
      ctx.ui.todos("saucedemo", ...checklist(3, 3));
      ctx.ui.zoom(1.35);
      ctx.ui.zoomOut(false);
      ctx.ui.ring("product", {
        selector: InventorySel.title(PRODUCT_ID),
        label: "Sauce Labs Backpack",
        detail: "tone: info (blue)",
        tone: "info",
        focus: true,
        zoom: 1.45,
        zoomOut: false,
      });
      ctx.ui.ring("add", {
        selector: InventorySel.addBtn(PRODUCT_ID),
        label: "Add to cart",
        detail: "tone: success (green)",
        tone: "success",
        focus: true,
        zoom: 1.5,
        zoomOut: false,
        weight: "bold",
      });
    },
    after: (ctx: StubCtx) => {
      ctx.ui.title("In the cart");
      ctx.ui.todos("saucedemo", ...checklist(4, 4));
      ctx.ui.zoomOut(false);
      ctx.ui.ring("badge", {
        selector: InventorySel.cartBadge,
        label: "Cart badge",
        detail: "tone: success (green) - count updated",
        tone: "success",
        focus: true,
        zoomOut: false,
        duration: true,
      });
    },
  },
  openCart: {
    before: (ctx: StubCtx) => {
      ctx.ui.title("Open cart · landscape");
      ctx.ui.orientation("landscape");
      ctx.ui.todos("saucedemo", ...checklist(5, 5));
      ctx.ui.zoom(1.4);
      ctx.ui.zoomOut(false);
      ctx.ui.ring("cart", {
        selector: CartSel.cartLink,
        label: "Cart",
        detail: "tone: planned (blue) - open cart",
        tone: "planned",
        focus: true,
        zoomOut: false,
        weight: "bold",
        gesture: "tap",
      });
    },
    after: (ctx: StubCtx) => {
      ctx.ui.title("Your cart · desktop");
      ctx.ui.hideDevice();
      ctx.ui.hideTodos();
      ctx.ui.zoomOut(true);
      ctx.ui.ring("items", {
        selector: InventorySel.cartItem,
        label: "Cart items",
        detail: "tone: success (green) - product in cart",
        tone: "success",
        focus: true,
        zoomOut: true,
        duration: true,
      });
    },
  },
};
