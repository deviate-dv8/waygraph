import { defineLayout, Trait } from "waygraph";
import { CartPage, CheckoutInfoPage, CheckoutOverviewPage, InventoryPage, ItemDetailPage, LoginPage, OrderComplete } from "../../states/checkout.states.js";
import { LoginSel } from "./methods/login.sel.js";
import { MenuSel } from "./menu.sel.js";
import { InventorySel } from "./inventory/methods/inventory-items.js";

/**
 * The burger menu on every page after sign-in. The login page shares this folder but has no menu, so the layout names
 * its pages (`on`). Its links are hidden until the menu opens: a link opens it first.
 */
export const Menu = defineLayout({
  name: "menu",
  description: "The burger menu: back to all items, or log out.",
  opens: MenuSel.button,
  on: [InventoryPage, ItemDetailPage, CartPage, CheckoutInfoPage, CheckoutOverviewPage, OrderComplete],
  go: {
    allItems: { to: InventoryPage, click: MenuSel.allItems, verify: [Trait.url({ pathname: "/inventory.html" })] },
    logout: { to: LoginPage, click: MenuSel.logout, verify: [Trait.visible(LoginSel.loginButton)] },
  },
  read: (ctx) => ({
    title: ctx.page.text(".title"),
    cartCount: ctx.page.fn(async (page) => {
      const badge = page.locator(InventorySel.cartBadge);
      return (await badge.count()) ? Number(await badge.first().innerText()) : 0;
    }),
  }),
  readAs: "header"
});
