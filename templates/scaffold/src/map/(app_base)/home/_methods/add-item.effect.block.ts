import {
  defineEffectBlock,
  type WaygraphInstanceOption,
} from "waygraph";
import { CanAddItem, ItemInCart } from "../../../../states/demo.states.js";
import { DemoKeys } from "../../../../states/demo.mem-keys.js";
import { DemoSel } from "../_sel.js";

/** `waygraph auto` lists one "Add …" row per live Add button via `instanceOptions`. */
export const AddItemBlock = defineEffectBlock({
  name: "add-item",
  description: "Adds the mem-selected catalog item to the cart.",
  from: CanAddItem,
  to: ItemInCart,
  requires: [DemoKeys.selectedItem],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(DemoKeys.selectedItem);
      await page.locator(DemoSel.addBtn(id)).click();
    },
    verify: [
      {
        name: "item-added",
        async check(page, mem) {
          const { id } = mem.get(DemoKeys.selectedItem);
          return page.locator(DemoSel.removeBtn(id)).isVisible();
        },
      },
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
        value: { id, name: id },
        highlight: DemoSel.addBtn(id),
      });
    }
    return out;
  },
});
