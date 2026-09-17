import {
  defineEffectBlock,
  checkpoint,
  type Checkpoint,
  type WaygraphInstanceOption,
} from "waygraph";
import type { CartEmpty } from "../../../states/demo.states.js";
import { SelectedItem } from "../../../states/demo.mem-keys.js";
import { DemoSel } from "../demo-sel.js";

/**
 * Kind: Effect
 * Helper: defineEffectBlock
 * Route: demo-web/methods/
 *
 * Removes one in-cart row. Auto menus one row per visible Remove button.
 */
export const RemoveItemBlock = defineEffectBlock<Checkpoint<string>, CartEmpty>({
  name: "remove-item",
  description: "Removes the mem-selected catalog item from the cart.",
  requires: [SelectedItem.key],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(SelectedItem.key);
      await page.locator(DemoSel.removeBtn(id)).click();
    },
    resolve: () => checkpoint("CartEmpty"),
    verify: [
      {
        name: "item-removed",
        async check(page, mem) {
          const { id } = mem.get(SelectedItem.key);
          return page.locator(DemoSel.addBtn(id)).isVisible();
        },
      },
    ],
    stubBefore: {},
    stubAfter: {
      cart: { selector: DemoSel.cartCount, label: "Cart count", duration: true },
    },
    stubOnError: {},
  },
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const buttons = page.locator("button.remove:not([hidden])");
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
        key: SelectedItem.key,
        value: { id, name: id },
        highlight: DemoSel.removeBtn(id),
      });
    }
    return out;
  },
});
