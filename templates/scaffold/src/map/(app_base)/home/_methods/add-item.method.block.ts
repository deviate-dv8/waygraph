import type { PageHandle, Trait, WaygraphInstanceOption } from "waygraph";
import { DemoKeys } from "../../../../states/demo.mem-keys.js";
import { HomePage } from "../_page.block.js";
import { DemoSel } from "../_sel.js";

/** Adds the item named in mem to the cart. One row per live Add button in `auto` and Pilot. */
export const addItem = (self: PageHandle<"Home">) =>
  self.method({
    name: "add-item",
    description: "Adds the mem-selected catalog item to the cart.",
    requires: [DemoKeys.selectedItem],
    async act(page, _input, mem) {
      const { id } = mem.get(DemoKeys.selectedItem);
      await page.locator(DemoSel.addBtn(id)).click();
    },
    verify: (): Trait[] => [HomePage.check("the item in the cart", ({ items }, mem) => items.some((item) => item.name === mem.get(DemoKeys.selectedItem).name && item.inCart))],
    async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
      const buttons = page.locator(DemoSel.addButtons);
      const out: WaygraphInstanceOption[] = [];
      for (let i = 0; i < (await buttons.count()); i++) {
        const label = ((await buttons.nth(i).textContent()) || "").trim();
        const id = ((await buttons.nth(i).getAttribute("data-test")) || "").replace(/^add-/, "");
        if (id) out.push({ id, label: label || `Add ${id}`, key: DemoKeys.selectedItem, value: { id, name: label.replace(/^Add\s+/, "") || id }, highlight: DemoSel.addBtn(id) });
      }
      return out;
    },
  });
