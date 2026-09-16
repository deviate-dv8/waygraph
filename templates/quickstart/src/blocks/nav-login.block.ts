import { defineNavBlock, Trait } from "waygraph";
import type { LoginPage } from "../states/checkout.states.js";

// Navigation lives in its own Block, built by defineNavBlock - its act() is
// ALWAYS exactly page.goto(url), generated for you, never hand-written. A
// regular defineBlock() Block that calls page.goto/reload/goBack/goForward
// instead gets a struck-through @deprecated warning in your editor, pointing
// back here - see waygraph's ActionPage type and `waygraph check`.
export const NavLoginBlock = defineNavBlock<LoginPage>({
  name: "nav-login",
  description: "Goes to the Swag Labs login page.",
  checkpoint: "LoginPage",
  url: "/",
  verify: [Trait.visible("#login-button")],
});
