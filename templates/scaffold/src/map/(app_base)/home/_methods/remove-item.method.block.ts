import {
  defineMethodBlock,
  type WaygraphInstanceOption, type Trait } from "waygraph";
import { Home } from "../../../../states/demo.states.js";
import { } from "../_reads.js";
import { DemoKeys } from "../../../../states/demo.mem-keys.js";
import { DemoSel } from "../_sel.js";
import { HomePage } from "../_page.block.js";

export const RemoveItemBlock = defineMethodBlock({
  name: "remove-item",
  description: "Removes the mem-selected catalog item from the cart.",
  from: Home,
  to: Home,
  requires: [DemoKeys.selectedItem],
  async act(page, _input, mem) {
    const { id } = mem.get(DemoKeys.selectedItem);
    await page.locator(DemoSel.removeBtn(id)).click();
  },
  verify: (): Trait[] => [
    HomePage.read.items.passes(
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
});
