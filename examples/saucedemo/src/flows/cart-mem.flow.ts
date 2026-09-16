import { Engine, start, end } from "waygraph";
import { RemoveFromCartBlock } from "../blocks/saucedemo-web/inventory/methods/remove-from-cart.effect.block.js";

const engine = new Engine();

// Registers remove-from-cart in the discoverable graph so waygraph auto can
// offer live "Remove … from cart" rows. Not a product checkout path - Add /
// Remove pairing for interactive explore.
export const cartMemFlow = engine.defineFlow([start, RemoveFromCartBlock, end]);
