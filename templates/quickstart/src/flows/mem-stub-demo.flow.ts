import { engine } from "../../config/waygraph.config.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";

/** memStub: the credentials are never supplied; src/states/checkout.mem-stubs.ts fills them. */
export const memStubDemoFlow = engine
  .map({ memStub: true })
  .gotoPage(NavLoginBlock)
  .method(FillUsernameBlock);
