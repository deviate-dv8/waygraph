import { engine } from "../../../config/waygraph.config.js";
import { Login } from "../../map/(shop)/_page.block.js";
/** memStub: the credentials are never supplied; src/states/checkout.mem-stubs.ts fills them. */
export const memStubDemoFlow = engine
  .map({ title: "Credentials from mem stubs", description: "memStub: credentials are never supplied; the flow fills them from the stubs.", labels: ["showcase"], memStub: true })
  .gotoPage(Login)
  .method(Login.do.fillUsername);
