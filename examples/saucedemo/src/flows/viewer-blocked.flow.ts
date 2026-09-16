import { Engine, start, end, withTitle, withSessionReset } from "waygraph";
import { NavLoginBlock } from "../blocks/nav-login.block.js";
import { SubmitLoginActionBlock } from "../blocks/actions/submit-login.action.block.js";

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
// submit-login now branches: observe sees no /inventory.html navigation,
// resolve -> LoginPage, verify confirms the error banner - the flow completes
// at LoginPage (not a thrown verify on a fake LoggedIn resolve).
export const viewerBlockedFlow = withTitle(
  withSessionReset(engine.defineFlow([start, NavLoginBlock, SubmitLoginActionBlock, end])),
  "Viewer: Blocked Login Attempt",
);
