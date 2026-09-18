import { Engine, start, end, withTitle } from "waygraph";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { SubmitLoginForFlow } from "../blocks/saucedemo-web/methods/submit-login-for-flow.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";

const engine = new Engine();

/**
 * Short device/orientation showcase (0.13.3+):
 *   login mobile portrait -> land on inventory landscape ->
 *   add-to-cart tablet portrait -> open cart tablet landscape -> desktop
 *
 * Run:
 *   npm run demo:device
 *   npm run demo:device:video
 */
export const deviceShowcaseFlow = withTitle(
  engine.defineFlow([
    start,
    NavLoginBlock,
    SubmitLoginForFlow,
    AddToCartBlock,
    NavCartBlock,
    end,
  ]),
  "Device showcase",
);
