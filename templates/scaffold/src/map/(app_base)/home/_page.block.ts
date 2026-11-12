import { definePageBlock, Trait } from "waygraph";
import { Home } from "../../../states/demo.states.js";
import { DemoSel, HOME_URL } from "./_sel.js";
import { WaygraphInstanceOption } from "waygraph";
import { DemoKeys } from "../../../states/demo.mem-keys.js";

export const HomePage = definePageBlock({
  name: "page-home",
  description: "Offline home hub - add/remove an item, clear the cart; expects hello.",
  checkpoint: Home,
  screenshot: true,
  url: HOME_URL,
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.catalog)],
  read: (ctx) => ({
      title: ctx.page.text(DemoSel.title),
      cartCount: ctx.page.number(DemoSel.cartCount),
      items: ctx.page.list(`${DemoSel.catalog} li.item`, (row) => ({
        name: row.text(".name"),
        inCart: row.visible("button.remove"),
      })),
      verified: ctx.page.visible(DemoSel.verifiedBanner),
    }),
  do: (self) => ({
  addItem: self.method({
  name: "add-item",
  description: "Adds the mem-selected catalog item to the cart.",
  requires: [DemoKeys.selectedItem],
  async act(page, _input, mem) {
      const { id } = mem.get(DemoKeys.selectedItem);
      await page.locator(DemoSel.addBtn(id)).click();
    },
  verify: (): Trait[] => [
      self.read.items.passes(
        (items, mem) => items.some((item) => item.name === mem.get(DemoKeys.selectedItem).name && item.inCart),
        "the item in the cart",
      ),
    ],
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
      const buttons = page.locator(DemoSel.addButtons);
      const n = await buttons.count();
      const out: WaygraphInstanceOption[] = [];
      for (let i = 0; i < n; i++) {
        const btn = buttons.nth(i);
        const label = ((await btn.textContent()) || "").trim();
        const testId = await btn.getAttribute("data-test");
        const id = (testId || "").replace(/^add-/, "");
        if (!id) continue;
        out.push({
          id,
          label: label || `Add ${id}`,
          key: DemoKeys.selectedItem,
          value: { id, name: label.replace(/^Add\s+/, "") || id },
          highlight: DemoSel.addBtn(id),
        });
      }
      return out;
    },
  }),
  removeItem: self.method({
  name: "remove-item",
  description: "Removes the mem-selected catalog item from the cart.",
  requires: [DemoKeys.selectedItem],
  async act(page, _input, mem) {
      const { id } = mem.get(DemoKeys.selectedItem);
      await page.locator(DemoSel.removeBtn(id)).click();
    },
  verify: (): Trait[] => [
      self.read.items.passes(
        (items, mem) => !items.some((item) => item.name === mem.get(DemoKeys.selectedItem).name && item.inCart),
        "the item out of the cart",
      ),
    ],
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
      const buttons = page.locator(DemoSel.removeButtons);
      const n = await buttons.count();
      const out: WaygraphInstanceOption[] = [];
      for (let i = 0; i < n; i++) {
        const btn = buttons.nth(i);
        const label = ((await btn.textContent()) || "").trim();
        const testId = await btn.getAttribute("data-test");
        const id = (testId || "").replace(/^remove-/, "");
        if (!id) continue;
        out.push({
          id,
          label: label || `Remove ${id}`,
          key: DemoKeys.selectedItem,
          value: { id, name: label.replace(/^Remove\s+/, "") || id },
          highlight: DemoSel.removeBtn(id),
        });
      }
      return out;
    },
  }),
  clearCart: self.method({
  name: "clear-cart",
  description: "Clears every item via the Clear cart control.",
  async act(page) {
      await page.locator(DemoSel.clear).click();
    },
  verify: (): Trait[] => [self.read.cartCount.is(0)],
  }),
  }),
  expects: (self) => ({
  hello: self.expect({
  name: "expect-hello",
  description: "Confirms the hello heading is still visible after arrival.",
  waitForHeading: "Hello Waygraph",
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.sub)],
  }),
  })
});
