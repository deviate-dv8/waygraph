import {
  defineEffectBlock,
  checkpoint,
  type Checkpoint,
  type WaygraphInstanceOption,
} from "waygraph";
import type { ItemInCart } from "../../../states/demo.states.js";
import { SelectedItem } from "../../../states/demo.mem-keys.js";
import { DemoSel } from "../demo-sel.js";

/**
 * Kind: Effect
 * Helper: defineEffectBlock
 * Route: demo-web/methods/
 *
 * Mutates one catalog row from mem. `waygraph auto` lists one "Add …" row per
 * live Add button via instanceOptions.
 */
export const AddItemBlock = defineEffectBlock<Checkpoint<string>, ItemInCart>({
  name: "add-item",
  description: "Adds the mem-selected catalog item to the cart.",
  requires: [SelectedItem.key],
  instruction: {
    async act(page, _input, mem) {
      const { id } = mem.get(SelectedItem.key);
      await page.locator(DemoSel.addBtn(id)).click();
    },
    resolve: () => checkpoint("ItemInCart"),
    verify: [
      {
        name: "item-added",
        async check(page, mem) {
          const { id } = mem.get(SelectedItem.key);
          return page.locator(DemoSel.removeBtn(id)).isVisible();
        },
      },
    ],
    stubBefore: {
      add: { selector: DemoSel.catalog, label: "Catalog" },
    },
    stubAfter: {
      cart: { selector: DemoSel.cartCount, label: "Cart count", duration: true },
    },
    stubOnError: {
      cart: { selector: DemoSel.cartCount, label: "Cart at failure", tag: "FAIL" },
    },
  },
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    const buttons = page.locator("button.add:not([hidden])");
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
        key: SelectedItem.key,
        value: { id, name: id },
        highlight: DemoSel.addBtn(id),
      });
    }
    return out;
  },
});
