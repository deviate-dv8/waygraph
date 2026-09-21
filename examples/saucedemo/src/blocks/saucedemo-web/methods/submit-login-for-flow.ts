import type { MethodBlock } from "waygraph";
import type { LoginPage, LoggedIn } from "../../../states/checkout.states.js";
import { SubmitLoginBlock } from "./submit-login.method.block.js";

/**
 * Kind: helper (not a discoverable Block file)
 * Helper: typed alias over SubmitLoginBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * MethodBlock cast so map().method() keeps the factory brand while Flows can
 * treat Out as LoggedIn; runtime still branches on bad credentials via
 * SubmitLoginBlock.
 */
export const SubmitLoginForFlow = SubmitLoginBlock as unknown as MethodBlock<LoginPage, LoggedIn>;
