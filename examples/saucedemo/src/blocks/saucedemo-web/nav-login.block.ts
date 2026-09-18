import { definePageBlock, Trait } from "waygraph";
import type { LoginPage } from "../../states/checkout.states.js";
import { SubmitLoginActionBlock } from "./methods/submit-login.method.block.js";

/**
 * Kind: Page
 * Helper: definePageBlock
 * Route: saucedemo-web/  (= /)
 *
 * Login screen hub. Deep-link via url; method submit-login hangs off this
 * page (stubBefore/stubAfter todos live on the Method). Name stays
 * `nav-login` so existing flows / chain specs keep working.
 */
export const NavLoginBlock = definePageBlock<LoginPage>({
  name: "nav-login",
  description: "Goes to the Swag Labs login page.",
  checkpoint: "LoginPage",
  url: "/",
  verify: [Trait.visible("#login-button")],
  methods: {
    submitLogin: () => SubmitLoginActionBlock,
  },
});
