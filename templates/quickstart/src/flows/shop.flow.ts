import { Engine, start, end, withTitle } from "waygraph";
import { NavLoginBlock } from "../blocks/nav-login.block.js";
import { SubmitLoginActionBlock } from "../blocks/actions/submit-login.action.block.js";
import { AddToCartBlock } from "../blocks/actions/add-to-cart.action.block.js";
import { NavCartBlock } from "../blocks/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/nav-checkout-info.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/actions/submit-checkout-info.action.block.js";
import { FinishOrderBlock } from "../blocks/actions/finish-order.action.block.js";

const engine = new Engine();

// Episode 1 - sign in, shop, checkout, place order.
export const shopFlow = withTitle(
  engine.defineFlow([
    start,
    NavLoginBlock,
    SubmitLoginActionBlock,
    AddToCartBlock,
    NavCartBlock,
    NavCheckoutInfoBlock,
    SubmitCheckoutInfoBlock,
    FinishOrderBlock,
    end,
  ]),
  "Shop & Checkout",
);
