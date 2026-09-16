import type { DefinedBlock } from "waygraph";
import type { LoginPage, LoggedIn } from "../../../states/checkout.states.js";
import { SubmitLoginActionBlock } from "./submit-login.method.block.js";

/**
 * Kind: helper (not a discoverable Block file)
 * Helper: typed alias over SubmitLoginActionBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * DefinedBlock cast so linear Flows can chain .withVerify on Out=LoggedIn;
 * runtime still branches on bad credentials via SubmitLoginActionBlock.
 */
export const SubmitLoginForFlow = SubmitLoginActionBlock as unknown as DefinedBlock<LoginPage, LoggedIn>;
