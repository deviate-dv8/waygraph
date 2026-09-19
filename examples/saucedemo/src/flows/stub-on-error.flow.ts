import {
  Engine,
  start,
  end,
  withTitle,
  withSessionReset,
  withExpectedFailure,
  withHighlightFixtures,
  Trait,
} from "waygraph";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginBlock } from "../blocks/saucedemo-web/methods/submit-login.method.block.js";

const engine = new Engine();

/**
 * Prove stubOnError (waygraph 0.12.4+): force verify to demand /inventory.html
 * while mem is locked_out_user — step throws, demo rings the error banner
 * before the error panel, then expected-failure styling.
 *
 *   waygraph demo --blocks stubOnErrorFlow --auto-next --fast \\
 *     --data '{"saucedemo.credentials":{"username":"locked_out_user","password":"secret_sauce"}}'
 */
const forcedInventoryVerify = withSessionReset(
  engine
    .defineFlow([start, NavLoginBlock, FillUsernameBlock, FillPasswordBlock, SubmitLoginBlock, end])
    .withBlockVerify("submit-login", [Trait.url({ pathname: "/inventory.html" })]),
);

export const stubOnErrorFlow = withHighlightFixtures(
  withExpectedFailure(
    withTitle(forcedInventoryVerify, "stubOnError: locked_out fail rings"),
    "Intentional verify fail - stubOnError rings the error banner before the panel",
  ),
  {
    "submit-login": {
      stubOnError: {
        error: {
          label: "BUG · locked out still on login",
          detail: "Verify demanded inventory; banner is the proof point.",
          tag: "FAIL",
          duration: true,
          fastMode: 500,
        },
      },
    },
  },
);
