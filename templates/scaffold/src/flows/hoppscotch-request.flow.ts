import { Engine, start, end, withTitle } from "waygraph";
import { NavHoppscotchSettingsBlock } from "../map/(external)/hoppscotch/settings/_nav.block.js";
import { PickExtensionInterceptorBlock } from "../map/(external)/hoppscotch/_methods/pick-extension-interceptor.method.block.js";
import { NavHoppscotchRestBlock } from "../map/(external)/hoppscotch/_nav.block.js";
import { SendRequestBlock } from "../map/(external)/hoppscotch/_methods/send-request.method.block.js";
import { AssertResponseOkBlock } from "../map/(external)/hoppscotch/_methods/assert-response-ok.method.block.js";
import "../map/(external)/hoppscotch/_page.block.js";

const engine = new Engine();

/** Needs `extensions: ["hoppscotch"]` in waygraph.config.ts. */
export const hoppscotchRequestFlow = withTitle(
  engine.defineFlow([
    start,
    NavHoppscotchSettingsBlock,
    PickExtensionInterceptorBlock,
    NavHoppscotchRestBlock,
    SendRequestBlock,
    AssertResponseOkBlock,
    end,
  ]),
  "Scaffold: Hoppscotch request through the browser extension",
);
