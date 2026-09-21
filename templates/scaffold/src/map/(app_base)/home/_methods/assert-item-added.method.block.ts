import { defineAssertBlock, Trait, type Trait as TraitType } from "waygraph";
import type { ItemInCart } from "../../../../states/demo.states.js";
import { SelectedItem } from "../../../../states/demo.mem-keys.js";
import { DemoSel } from "../_sel.js";

/**
 * Mem-aware Trait: which item's Remove button should be visible depends on
 * which row add-item just acted on (mem, not a static selector) - a Trait's
 * own `check(page, mem)` already receives mem, so this reads it directly.
 */
const removeButtonVisibleForSelectedItem: TraitType = {
  name: "remove-button-visible-for-selected-item",
  async check(page, mem) {
    const { id } = mem.get(SelectedItem.key);
    return page.locator(DemoSel.removeBtn(id)).isVisible();
  },
};

/**
 * Kind: Assert
 * Helper: defineAssertBlock
 * Route: demo-web/methods/
 *
 * "Did add-item actually work" - provable only after the fact, from the
 * method's real effect on the page: the specific row's own Remove button
 * appeared (mem-matched, not just "some" row), AND the aggregate cart count
 * reflects it. Self-loop on ItemInCart - no state change, verify only.
 *
 * Explicit `<ItemInCart>` type argument - `defineAssertBlock` defaults to
 * wildcard `Checkpoint<string>` when uninferred, which only "works" when the
 * assert sits last in a chain; this one sits mid-chain (see shop.flow.ts).
 */
export const AssertItemAddedBlock = defineAssertBlock<ItemInCart>({
  name: "assert-item-added",
  description: "Confirms the mem-selected item's own Remove button appeared and the cart count reflects it.",
  checkpoint: "ItemInCart",
  verify: [removeButtonVisibleForSelectedItem, Trait.text(DemoSel.cartCount, "1")],
});
