import { definePageBlock, Trait } from "waygraph";
import { MailpitKeys } from "../../../(external)/mailpit/_keys.js";
import { DemoSel, HOME_URL } from "./_sel.js";
import { addItem } from "./_methods/add-item.method.block.js";
import { removeItem } from "./_methods/remove-item.method.block.js";
import { clearCart } from "./_methods/clear-cart.method.block.js";

/** The catalogue: add and remove items, clear the cart. Opened with the verification link from the mail, when mem has one. */
export const HomePage = definePageBlock({
  name: "page-home",
  description: "Offline home hub - add/remove an item, clear the cart; expects hello.",
  checkpoint: "Home",
  screenshot: true,
  // The mail verification story: the link `extract-email-link` put in mem is this page again, now showing the verified banner.
  url: (mem) => (mem.has(MailpitKeys.emailLink) ? mem.get(MailpitKeys.emailLink).url : HOME_URL),
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.catalog)],
  read: (ctx) => ({
    title: ctx.page.text(DemoSel.title),
    cartCount: ctx.page.number(DemoSel.cartCount),
    items: ctx.page.list(`${DemoSel.catalog} li.item`, (row) => ({ name: row.text(".name"), inCart: row.visible("button.remove") })),
    verified: ctx.page.visible(DemoSel.verifiedBanner),
  }),
  do: (self) => ({ addItem: addItem(self), removeItem: removeItem(self), clearCart: clearCart(self) }),
  expects: (self) => ({
    hello: self.expect({
      name: "expect-hello",
      description: "Confirms the hello heading is still visible after arrival.",
      waitForHeading: "Hello Waygraph",
      verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.sub)],
    }),
    verified: self.check("the verified banner is up", ({ verified }) => verified),
  }),
});
