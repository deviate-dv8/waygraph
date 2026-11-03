import { engine } from "../../config/waygraph.config.js";
import { Login } from "../blocks/saucedemo-web/nav-login.block.js";
/** memStub: the credentials are never supplied; src/states/checkout.mem-stubs.ts fills them. */
export const memStubDemoFlow = engine
  .map({ memStub: true })
  .gotoPage(Login)
  .method(Login.do.fillUsername);
