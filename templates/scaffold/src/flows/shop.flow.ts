import {
  Engine,
  start,
  end,
  withTitle,
  withHighlightFixtures,
  withSessionReset,
  withMemStub,
  registerMemStub,
} from "waygraph";
import { NavHomeBlock } from "../map/(app_base)/home/_nav.block.js";
import { AddItemBlock } from "../map/(app_base)/home/_methods/add-item.effect.block.js";
import { AssertItemAddedBlock } from "../map/(app_base)/home/_methods/assert-item-added.method.block.js";
import { RemoveItemBlock } from "../map/(app_base)/home/_methods/remove-item.effect.block.js";
import { ClearCartBlock } from "../map/(app_base)/home/_methods/clear-cart.method.block.js";
import { SelectedItem } from "../states/demo.mem-keys.js";
import "../map/(app_base)/home/_page.block.js";

const engine = new Engine();

/**
 * memStub: a real fixture row (`alpha`/`Alpha`), registered once so this Flow never needs
 * --data at all. Still override-able - `--data '{"demo.selectedItem":{"id":"beta",...}}'`
 * wins over this registration, same as any other memStub (see docs/REFERENCE.md's own
 * "memStub - fake values for requires" section).
 */
registerMemStub(SelectedItem.key, () => ({ id: "alpha", name: "Alpha" }));

/**
 * Effect + Method demo. `requires: [SelectedItem.key]` (on `add-item`) is filled automatically
 * by the memStub registration above - no --data needed. Override it with real data, or use
 * `waygraph auto` which fills SelectedItem via instanceOptions instead:
 *
 *   waygraph demo --blocks shopFlow                                    # memStub fills it
 *   waygraph demo --blocks shopFlow --data '{"demo.selectedItem":{"id":"beta","name":"Beta"}}'
 *   waygraph auto   # after landing on home, pick Add Alpha / Add Beta / Remove ...
 *
 * Add -> assert it actually landed (mem-matched Remove button + cart count,
 * only provable from the method's real effect, not a static page state) ->
 * Remove that same row (per-item Effect, `remove-item`) -> Add again ->
 * Clear cart (bulk Method, `clear-cart`) - keeps both the per-item and bulk
 * clear paths atomic and each wired into a real flow, not orphaned.
 */
export const shopFlow = withMemStub(
  withHighlightFixtures(
    withTitle(
      withSessionReset(
        engine.defineFlow([
          start,
          NavHomeBlock,
          AddItemBlock,
          AssertItemAddedBlock,
          RemoveItemBlock,
          AddItemBlock,
          ClearCartBlock,
          end,
        ]),
      ),
      "Scaffold: Shop (Effect + clear)",
    ),
    {
      "add-item": {
        stubAfter: {
          cart: {
            label: "AC · item in cart",
            detail: "Cart count bumped after Add.",
            tag: "AC",
            duration: true,
          },
        },
      },
    },
  ),
);
