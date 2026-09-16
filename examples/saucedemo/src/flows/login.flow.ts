import { Engine, start, end, withTitle } from "waygraph";
import { NavLoginBlock } from "../blocks/nav-login.block.js";
import { SubmitLoginForFlow } from "../blocks/actions/submit-login-for-flow.js";

const engine = new Engine();

// The step-mode overlay prepends "Episode N: " itself - the title here is
// just the label, not the full heading.
export const loginFlow = withTitle(
  engine.defineFlow([start, NavLoginBlock, SubmitLoginForFlow, end]),
  "Sign In",
);
