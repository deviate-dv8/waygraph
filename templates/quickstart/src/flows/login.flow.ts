import { Engine, start, end, withTitle } from "waygraph";
import { NavLoginBlock } from "../blocks/nav-login.block.js";
import { SubmitLoginActionBlock } from "../blocks/actions/submit-login.action.block.js";

const engine = new Engine();

// Optional standalone sign-in only (try demo uses shopFlow as Episode 1).
export const loginFlow = withTitle(
  engine.defineFlow([start, NavLoginBlock, SubmitLoginActionBlock, end]),
  "Sign In",
);
