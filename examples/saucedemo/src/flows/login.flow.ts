import { Engine, start, end, withTitle } from "waygraph";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginForFlow } from "../blocks/saucedemo-web/methods/submit-login-for-flow.js";

const engine = new Engine();

// The step-mode overlay prepends "Episode N: " itself - the title here is
// just the label, not the full heading.
export const loginFlow = withTitle(
  engine.defineFlow([start, NavLoginBlock, FillUsernameBlock, FillPasswordBlock, SubmitLoginForFlow, end]),
  "Sign In",
);
