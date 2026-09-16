import { Engine, start, end, withTitle, withSessionReset, withExpectedFailure } from "waygraph";
import { NavLoginBlock } from "../blocks/nav-login.block.js";
import { SubmitViewerLoginActionBlock } from "../blocks/actions/submit-viewer-login.action.block.js";

const engine = new Engine();

export const viewerBlockedFlow = withTitle(
  withExpectedFailure(
    withSessionReset(engine.defineFlow([start, NavLoginBlock, SubmitViewerLoginActionBlock, end])),
    "locked_out_user can never reach /inventory.html - saucedemo.com genuinely blocks this account. " +
      "The step below throwing is this demo working as intended, not a bug in the chain.",
  ),
  "Viewer: Blocked Login Attempt",
);
