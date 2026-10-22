import { engine } from "../../config/waygraph.config.js";
import "../states/checkout.mem-stubs.js";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";

/** memStub: the credentials are never supplied; src/states/checkout.mem-stubs.ts fills them. */
export const memStubDemoFlow = engine
  .map({ memStub: true })
  .start()
  .gotoPage(NavLoginBlock)
  .method(FillUsernameBlock)
  .end();
