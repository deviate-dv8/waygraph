import { Engine, start, end, withTitle } from "waygraph";
import { NavLoginBlock } from "../blocks/nav-login.block.js";
import { SubmitLoginActionBlock } from "../blocks/actions/submit-login.action.block.js";

const engine = new Engine();

// Episode 1 - the step overlay shows "Episode 1: Sign In".
export const loginFlow = withTitle(
  engine.defineFlow([start, NavLoginBlock, SubmitLoginActionBlock, end]),
  "Sign In",
);
