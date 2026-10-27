import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginBlock } from "../blocks/saucedemo-web/methods/submit-login.method.block.js";
import { LoggedIn } from "../states/checkout.states.js";

/** Standard user signs in. Credentials come from the memStub in src/states/checkout.mem-stubs.ts unless --data / mem set them. */
export const loginFlow = engine
  .map({ memStub: true })
  .start()
  .gotoPage(NavLoginBlock.stubBefore((ctx) => ctx.ui.title("Sign In")))
  .method(FillUsernameBlock)
  .method(FillPasswordBlock)
  .method(SubmitLoginBlock, { lands: LoggedIn })
  .end();
