import { defineAssertBlock, Trait, type Trait as TraitType } from "waygraph";
import type { ItemInCart } from "../../../../states/demo.states.js";
import { SelectedItem } from "../../../../states/demo.mem-keys.js";
import { DemoSel } from "../_sel.js";

// Reads mem at check time, so it follows whichever item add-item acted on.
const removeButtonVisibleForSelectedItem: TraitType = {
  name: "remove-button-visible-for-selected-item",
  async check(page, mem) {
    const { id } = mem.get(SelectedItem.key);
    return page.locator(DemoSel.removeBtn(id)).isVisible();
  },
};

/** The mem-selected item's own Remove button appeared and the cart count reflects it. */
export const AssertItemAddedBlock = defineAssertBlock<ItemInCart>({
  name: "assert-item-added",
  description: "Confirms the mem-selected item's own Remove button appeared and the cart count reflects it.",
  checkpoint: "ItemInCart",
  verify: [removeButtonVisibleForSelectedItem, Trait.text(DemoSel.cartCount, "1")],
});
