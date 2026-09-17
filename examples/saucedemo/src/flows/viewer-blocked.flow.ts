import { Engine, start, end, withTitle, withSessionReset, withExpectedFailure } from "waygraph";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { SubmitLoginActionBlock } from "../blocks/saucedemo-web/methods/submit-login.method.block.js";

const engine = new Engine();

// A genuinely DIFFERENT scenario from checkoutFlow - not the same steps
// split in half. Same login blocks, different user, different outcome:
// locked_out_user attempts the exact same login an Owner (standard_user,
// checkoutFlow) just completed successfully, and is blocked -
// saucedemo.com's real response, verified live: stays on "/", shows
// "Epic sadface: Sorry, this user has been locked out."
//
// withSessionReset matters here for real, not cosmetically - entered right
// after checkoutFlow's already-authenticated session, this needs its own
// genuinely fresh cookies/storage, or the previous user's session would
// still be live and this login attempt wouldn't mean anything.
//
// submit-login branches: observe sees no /inventory.html navigation,
// resolve -> LoginPage, verify confirms the error banner. Demo still wraps
// withExpectedFailure so step 9/9 shows stubOnError rings + amber
// "expected outcome" panel (branching no longer throws).
export const viewerBlockedFlow = withExpectedFailure(
  withTitle(
    withSessionReset(engine.defineFlow([start, NavLoginBlock, SubmitLoginActionBlock, end])),
    "Viewer: Blocked Login Attempt",
  ),
  "locked_out_user stays on LoginPage with the error banner - this is the product working as intended.",
);
