import { Engine } from "waygraph";
import { NavHoppscotchSettingsBlock } from "../map/(external)/hoppscotch/settings/_nav.block.js";
import { PickExtensionInterceptorBlock } from "../map/(external)/hoppscotch/_methods/pick-extension-interceptor.method.block.js";
import { NavHoppscotchRestBlock } from "../map/(external)/hoppscotch/_nav.block.js";
import { SetQueryParamsBlock } from "../map/(external)/hoppscotch/_methods/set-query-params.method.block.js";
import { SetUrlBlock } from "../map/(external)/hoppscotch/_methods/set-url.method.block.js";
import { SetBearerTokenBlock } from "../map/(external)/hoppscotch/_methods/set-bearer-token.method.block.js";
import { SendRequestBlock } from "../map/(external)/hoppscotch/_methods/send-request.method.block.js";
import { AssertStatusBlock } from "../map/(external)/hoppscotch/_methods/assert-status.method.block.js";
import { ReadResponseHeadersBlock } from "../map/(external)/hoppscotch/_methods/read-response-headers.method.block.js";
import { AssertResponseHeaderBlock } from "../map/(external)/hoppscotch/_methods/assert-response-header.method.block.js";
import { ReadResponseBodyBlock } from "../map/(external)/hoppscotch/_methods/read-response-body.method.block.js";
import { AssertResponseBodyBlock } from "../map/(external)/hoppscotch/_methods/assert-response-body.method.block.js";
import "../map/(external)/hoppscotch/_page.block.js";

const engine = new Engine();

/** GET with query params and a bearer token, check the status, that the API received them, and a response header. Needs `extensions: ["hoppscotch"]`. */
export const hoppscotchAuthFlow = engine
  .map()
  .start()
  .gotoExternal(NavHoppscotchSettingsBlock)
  .method(PickExtensionInterceptorBlock)
  .gotoExternal(NavHoppscotchRestBlock)
  .method(SetUrlBlock)
  .method(SetQueryParamsBlock)
  .method(SetBearerTokenBlock)
  .method(SendRequestBlock)
  .assert(AssertStatusBlock)
  .method(ReadResponseBodyBlock)
  .assert(AssertResponseBodyBlock)
  .method(ReadResponseHeadersBlock)
  .assert(AssertResponseHeaderBlock)
  .end({ title: "Scaffold: Hoppscotch GET with query params and bearer token" });
