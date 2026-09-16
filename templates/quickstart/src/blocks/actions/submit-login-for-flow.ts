import type { DefinedBlock } from "waygraph";
import type { LoginPage, LoggedIn } from "../../states/checkout.states.js";
import { SubmitLoginActionBlock } from "./submit-login.action.block.js";

// DefinedBlock, not the plain Block interface - SubmitLoginActionBlock really
// does have withVerify/modVerify/modVerifyAll attached (built via
// defineBlock()); widening to plain Block here made those optional again and
// broke chained `.withVerify([])` calls in linear Flows (smoke.flow.ts).
/** Linear defineFlow chains: Out typed as LoggedIn; runtime still branches on bad creds. */
export const SubmitLoginForFlow = SubmitLoginActionBlock as unknown as DefinedBlock<LoginPage, LoggedIn>;
