import {
  defineMethodBlock,
  type WaygraphInstanceOption,
} from "waygraph";
import { Home } from "../../../../states/demo.states.js";
import { HomeRead } from "../_reads.js";
import { DemoKeys } from "../../../../states/demo.mem-keys.js";
import { DemoSel } from "../_sel.js";

/**
 * The page stays the home page; its Read Block shows the item in the cart. `waygraph auto` lists one "Add …" row per
 * live Add button via `instanceOptions`.
 */
export const AddItemBlock = defineMethodBlock({
  name: "add-item",
  description: "Adds the mem-selected catalog item to the cart.",
  from: Home,
  to: Home,
  requires: [DemoKeys.selectedItem],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(DemoKeys.selectedItem);
      await page.locator(DemoSel.addBtn(id)).click();
    },
    verify: [
      HomeRead.items.passes(
        (items, mem) => items.some((item) => item.name === mem.get(DemoKeys.selectedItem).name && item.inCart),
        "the item in the cart",
      ),
    ],
  },
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
});
