import {
  Engine,
  start,
  end,
  withTitle,
  withHighlightFixtures,
  withSessionReset,
} from "waygraph";
import { NavHomeBlock } from "../blocks/demo-web/nav-home.block.js";
import { AddItemBlock } from "../blocks/demo-web/methods/add-item.effect.block.js";
import { RemoveItemBlock } from "../blocks/demo-web/methods/remove-item.effect.block.js";
import { ClearCartBlock } from "../blocks/demo-web/methods/clear-cart.method.block.js";
import "../blocks/demo-web/home.page.block.js";

const engine = new Engine();

/**
 * Effect + Method demo (set mem for add-item, or use `waygraph auto` which
 * fills SelectedItem via instanceOptions).
 *
 *   waygraph demo --blocks shopFlow --data '{"demo.selectedItem":{"id":"alpha","name":"Alpha"}}'
 *   waygraph auto   # after landing on home, pick Add Alpha / Add Beta / Remove ...
 *
 * Add -> Remove that same row (per-item Effect, `remove-item`) -> Add again ->
 * Clear cart (bulk Method, `clear-cart`) - keeps both the per-item and bulk
 * clear paths atomic and each wired into a real flow, not orphaned.
 */
export const shopFlow = withHighlightFixtures(
  withTitle(
    withSessionReset(
      engine.defineFlow([
        start,
        NavHomeBlock,
        AddItemBlock,
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
);
