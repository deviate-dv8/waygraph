import { Engine, start, end, withTitle } from "waygraph";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavContinueShoppingBlock } from "../blocks/saucedemo-web/inventory-item/nav-continue-shopping.block.js";

const engine = new Engine();

// Open cart and continue shopping - wires orphan nav-continue-shopping Block.
export const cartContinueFlow = withTitle(
  engine.defineFlow([start, NavCartBlock, NavContinueShoppingBlock, end]),
  "Cart then continue shopping",
);
