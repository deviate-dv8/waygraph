import type { DefinedBlock } from "waygraph";
import type { LoginPage, LoggedIn } from "../../../states/checkout.states.js";
import { SubmitLoginBlock } from "./submit-login.method.block.js";

/**
 * Kind: helper (not a discoverable Block file)
 * Helper: typed alias over SubmitLoginBlock
 * Route: saucedemo-web/methods/  (page URL /)
 *
 * DefinedBlock cast so linear Flows can chain .withVerify on Out=LoggedIn;
 * runtime still branches on bad credentials via SubmitLoginBlock.
 */
export const SubmitLoginForFlow = SubmitLoginBlock as unknown as DefinedBlock<LoginPage, LoggedIn>;
