import { Engine, start, end, withTitle } from "waygraph";
import { AddToCartBlock } from "../blocks/actions/add-to-cart.action.block.js";
import { NavCartBlock } from "../blocks/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/nav-checkout-info.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/actions/submit-checkout-info.action.block.js";
import { FinishOrderBlock } from "../blocks/actions/finish-order.action.block.js";

const engine = new Engine();

// Episode 2 - chained after loginFlow via chainFlow(...).
export const shopFlow = withTitle(
  engine.defineFlow([
    start,
    AddToCartBlock,
    NavCartBlock,
    NavCheckoutInfoBlock,
    SubmitCheckoutInfoBlock,
    FinishOrderBlock,
    end,
  ]),
  "Shop & Checkout",
);
