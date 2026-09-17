import { fastForwardComposeBlock } from "waygraph";
import { NavLoginBlock } from "./nav-login.block.js";
import { SubmitLoginForFlow } from "./methods/submit-login-for-flow.js";

/**
 * Kind: FFCompose (fast-forward)
 * Helper: fastForwardComposeBlock
 * Route: saucedemo-web/  (auth prefix)
 *
 * Collapses nav-login + submit-login into one opaque demo/run step so
 * checkout demos skip watching auth. Use --ff-expand to gate inners again.
 * loginFlow stays expanded for Sign In episode narration.
 */
export const FfOwnerAuthBlock = fastForwardComposeBlock("ff-owner-auth", [
  NavLoginBlock,
  SubmitLoginForFlow,
]);
