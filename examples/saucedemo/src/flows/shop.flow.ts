import { Engine, start, end, withTitle } from "waygraph";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";
import { NavCartBlock } from "../blocks/saucedemo-web/cart/nav-cart.block.js";
import { NavCheckoutInfoBlock } from "../blocks/saucedemo-web/cart/nav-checkout-info.block.js";
import { FillFirstNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-first-name.method.block.js";
import { FillLastNameBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-last-name.method.block.js";
import { FillPostalCodeBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/fill-postal-code.method.block.js";
import { SubmitCheckoutInfoBlock } from "../blocks/saucedemo-web/checkout-step-one/methods/submit-checkout-info.method.block.js";
import { FinishOrderBlock } from "../blocks/saucedemo-web/checkout-step-two/methods/finish-order.method.block.js";

const engine = new Engine();

// Episode-2 half of chainFlow(loginFlow, shopFlow) - assumes already LoggedIn
// (AddToCartBlock's In is the Checkpoint<string> wildcard).
export const shopFlow = withTitle(
  engine.defineFlow([
    start,
    AddToCartBlock,
    NavCartBlock,
    NavCheckoutInfoBlock,
    FillFirstNameBlock,
    FillLastNameBlock,
    FillPostalCodeBlock,
    SubmitCheckoutInfoBlock,
    FinishOrderBlock,
    end,
  ]),
  "Shop & Checkout",
);
