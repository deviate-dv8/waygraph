import {
  defineEffectBlock,
  type WaygraphInstanceOption,
} from "waygraph";
import { CartEmpty, ItemInCart } from "../../../../states/demo.states.js";
import { DemoKeys } from "../../../../states/demo.mem-keys.js";
import { DemoSel } from "../_sel.js";

export const RemoveItemBlock = defineEffectBlock({
  name: "remove-item",
  description: "Removes the mem-selected catalog item from the cart.",
  from: ItemInCart,
  to: CartEmpty,
  requires: [DemoKeys.selectedItem],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(DemoKeys.selectedItem);
      await page.locator(DemoSel.removeBtn(id)).click();
    },
    verify: [
      {
        name: "item-removed",
        async check(page, mem) {
          const { id } = mem.get(DemoKeys.selectedItem);
          return page.locator(DemoSel.addBtn(id)).isVisible();
        },
      },
    ],
  },
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
        value: { id, name: id },
        highlight: DemoSel.removeBtn(id),
      });
    }
    return out;
  },
});
