import { engine } from "../../../../config/waygraph.config.js";
import { NavHoppscotchSettingsBlock } from "../../../map/(external)/hoppscotch/settings/_nav.block.js";
import { PickExtensionInterceptorBlock } from "../../../map/(external)/hoppscotch/_methods/pick-extension-interceptor.method.block.js";
import { NavHoppscotchRestBlock } from "../../../map/(external)/hoppscotch/_nav.block.js";
import { SetMethodBlock } from "../../../map/(external)/hoppscotch/_methods/set-method.method.block.js";
import { SetUrlBlock } from "../../../map/(external)/hoppscotch/_methods/set-url.method.block.js";
import { SetHeadersBlock } from "../../../map/(external)/hoppscotch/_methods/set-headers.method.block.js";
import { SetJsonBodyBlock } from "../../../map/(external)/hoppscotch/_methods/set-json-body.method.block.js";
import { SendRequestBlock } from "../../../map/(external)/hoppscotch/_methods/send-request.method.block.js";
import { AssertStatusBlock } from "../../../map/(external)/hoppscotch/_methods/assert-status.method.block.js";
import { ReadResponseBodyBlock } from "../../../map/(external)/hoppscotch/_methods/read-response-body.method.block.js";
import { AssertResponseBodyBlock } from "../../../map/(external)/hoppscotch/_methods/assert-response-body.method.block.js";
import "../../../map/(external)/hoppscotch/_page.block.js";

/** POST JSON with a header, check the status and the response body. Needs `extensions: ["hoppscotch"]`. */
export const hoppscotchPostFlow = engine
  .map()
  .start()
  .gotoExternal(
    NavHoppscotchSettingsBlock.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Hoppscotch POST with header and JSON body");
    }),
  )
  .method(PickExtensionInterceptorBlock)
  .gotoExternal(NavHoppscotchRestBlock)
  .method(SetMethodBlock)
  .method(SetUrlBlock)
  .method(SetHeadersBlock)
  .method(SetJsonBodyBlock)
  .method(SendRequestBlock)
  .assert(AssertStatusBlock)
  .method(ReadResponseBodyBlock)
  .assert(AssertResponseBodyBlock)
  .end();
