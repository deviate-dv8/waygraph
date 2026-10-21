import { Engine, start, end, withTitle } from "waygraph";
import { NavHoppscotchSettingsBlock } from "../map/(external)/hoppscotch/settings/_nav.block.js";
import { PickExtensionInterceptorBlock } from "../map/(external)/hoppscotch/_methods/pick-extension-interceptor.method.block.js";
import { NavHoppscotchRestBlock } from "../map/(external)/hoppscotch/_nav.block.js";
import { SetUrlBlock } from "../map/(external)/hoppscotch/_methods/set-url.method.block.js";
import { SendRequestBlock } from "../map/(external)/hoppscotch/_methods/send-request.method.block.js";
import { AssertStatusBlock } from "../map/(external)/hoppscotch/_methods/assert-status.method.block.js";
import "../map/(external)/hoppscotch/_page.block.js";

const engine = new Engine();

/** GET a URL and check the status. Needs `extensions: ["hoppscotch"]` in waygraph.config.ts. */
export const hoppscotchGetFlow = withTitle(
  engine.defineFlow([
    start,
    NavHoppscotchSettingsBlock,
    PickExtensionInterceptorBlock,
    NavHoppscotchRestBlock,
    SetUrlBlock,
    SendRequestBlock,
    AssertStatusBlock,
    end,
  ]),
  "Scaffold: Hoppscotch GET",
);
