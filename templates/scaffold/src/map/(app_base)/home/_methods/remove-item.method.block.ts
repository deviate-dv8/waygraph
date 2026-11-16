import type { PageHandle, Trait, WaygraphInstanceOption } from "waygraph";
import { DemoKeys } from "../../../../states/demo.mem-keys.js";
import { HomePage } from "../_page.block.js";
import { DemoSel } from "../_sel.js";

/** Takes the item named in mem out of the cart. One row per live Remove button in `auto` and Pilot. */
export const removeItem = (self: PageHandle<"Home">) =>
  self.method({
    name: "remove-item",
    description: "Removes the mem-selected catalog item from the cart.",
    requires: [DemoKeys.selectedItem],
    async act(page, _input, mem) {
      const { id } = mem.get(DemoKeys.selectedItem);
      await page.locator(DemoSel.removeBtn(id)).click();
    },
    verify: (): Trait[] => [HomePage.check("the item out of the cart", ({ items }, mem) => !items.some((item) => item.name === mem.get(DemoKeys.selectedItem).name && item.inCart))],
    async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
      const buttons = page.locator(DemoSel.removeButtons);
      const out: WaygraphInstanceOption[] = [];
      for (let i = 0; i < (await buttons.count()); i++) {
        const label = ((await buttons.nth(i).textContent()) || "").trim();
        const id = ((await buttons.nth(i).getAttribute("data-test")) || "").replace(/^remove-/, "");
        if (id) out.push({ id, label: label || `Remove ${id}`, key: DemoKeys.selectedItem, value: { id, name: label.replace(/^Remove\s+/, "") || id }, highlight: DemoSel.removeBtn(id) });
      }
      return out;
    },
  });
