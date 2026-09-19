import { Engine, start, end } from "waygraph";
import type { LoginPage, LoggedIn, ItemInCart } from "../states/checkout.states.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginForFlow } from "../blocks/saucedemo-web/methods/submit-login-for-flow.js";
import { AddToCartBlock } from "../blocks/saucedemo-web/inventory/methods/add-to-cart.effect.block.js";

const engine = new Engine();

// The QA case: a smoke test only cares that it was able to navigate this far -
// it doesn't need the same DOM confirmation the real checkout.flow.ts wants.
// Same Blocks, same act/resolve, zero duplication - only verify differs.
// .withVerify([]) reads from the Block itself, discoverable by typing
// "NavLoginBlock."/"SubmitLoginForFlow." in an editor - not a free function
// you have to already know exists.
//
// Explicit <LoginPage, LoginPage, LoginPage, LoggedIn, ItemInCart> here -
// AddToCartBlock's In is now the wildcard Checkpoint<string> (it's reused as
// shopFlow's own entry block too), and inferring the chain purely from
// several chained .withVerify([]) calls in one array trips TS's overload
// resolution into unifying the wrong Out type partway through; pinning the
// type args sidesteps it rather than fighting it. The two middle `LoginPage`
// entries are fill-username / fill-password (self-loop Methods).
export const smokeFlow = engine.defineFlow<LoginPage, LoginPage, LoginPage, LoggedIn, ItemInCart>([
  start,
  NavLoginBlock.withVerify([]),
  FillUsernameBlock,
  FillPasswordBlock,
  SubmitLoginForFlow.withVerify([]),
  AddToCartBlock.withVerify([]),
  end,
]);
