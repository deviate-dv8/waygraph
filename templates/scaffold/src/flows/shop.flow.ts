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
import { ClearCartBlock } from "../blocks/demo-web/methods/clear-cart.method.block.js";
import "../blocks/demo-web/home.page.block.js";

const engine = new Engine();

/**
 * Effect + Method demo (set mem for add-item, or use `waygraph auto` which
 * fills SelectedItem via instanceOptions).
 *
 *   waygraph demo --blocks shopFlow --data '{"demo.selectedItem":{"id":"alpha","name":"Alpha"}}'
 *   waygraph auto   # after landing on home, pick Add Alpha / Add Beta / …
 */
export const shopFlow = withHighlightFixtures(
  withTitle(
    withSessionReset(
      engine.defineFlow([start, NavHomeBlock, AddItemBlock, ClearCartBlock, end]),
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
