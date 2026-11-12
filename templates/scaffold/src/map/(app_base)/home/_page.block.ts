import { definePageBlock, Trait } from "waygraph";
import { Home } from "../../../states/demo.states.js";
import { DemoSel, HOME_URL } from "./_sel.js";
import { AddItemBlock } from "./_methods/add-item.method.block.js";
import { RemoveItemBlock } from "./_methods/remove-item.method.block.js";
import { ClearCartBlock } from "./_methods/clear-cart.method.block.js";
import { ExpectHelloBlock } from "./_expect/hello.expect.block.js";

export const HomePage = definePageBlock({
  name: "page-home",
  description: "Offline home hub - add/remove an item, clear the cart; expects hello.",
  checkpoint: Home,
  screenshot: true,
  url: HOME_URL,
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.catalog)],
  do: () => ({ addItem: AddItemBlock, removeItem: RemoveItemBlock, clearCart: ClearCartBlock }),
  expects: () => ({ hello: ExpectHelloBlock }),
  read: (ctx) => ({
    title: ctx.page.text(DemoSel.title),
    cartCount: ctx.page.number(DemoSel.cartCount),
    items: ctx.page.list(`${DemoSel.catalog} li.item`, (row) => ({
      name: row.text(".name"),
      inCart: row.visible("button.remove"),
    })),
    verified: ctx.page.visible(DemoSel.verifiedBanner),
  })
});
