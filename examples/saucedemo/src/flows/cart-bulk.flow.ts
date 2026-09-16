import { Engine, start, end, withTitle, chainFlow } from "waygraph";
import { loginFlow } from "./login.flow.js";
import { AddAllToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-all-to-cart.method.block.js";
import { RemoveAllFromCartBlock } from "../blocks/saucedemo-web/inventory/methods/remove-all-from-cart.method.block.js";

const engine = new Engine();

/**
 * Episode after login: drain every Add button, then every Remove button.
 * Proves bulk Methods + round-trip (LoggedIn <-> ItemInCart) without
 * instanceOptions. Pair with loginFlow via chainFlow for `waygraph demo`.
 */
export const cartBulkEpisode = withTitle(
  engine.defineFlow([start, AddAllToCartBlock, RemoveAllFromCartBlock, end]),
  "Cart bulk add/remove all",
);

/** Full demo: Sign In -> Add all -> Remove all. */
export const cartBulkFlow = chainFlow(loginFlow, cartBulkEpisode);
