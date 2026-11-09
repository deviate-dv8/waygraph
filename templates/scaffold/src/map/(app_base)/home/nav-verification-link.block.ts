import { defineNavBlock } from "waygraph";
import { Home } from "../../../states/demo.states.js";
import { MailpitKeys } from "../../(external)/mailpit/_keys.js";
import { HomeRead } from "./_reads.js";

/**
 * Follows the link `extract-email-link` put in mem: back on the home page, which now shows the verified banner. No
 * `requires`: an earlier Block in the chain produces it.
 */
export const NavVerificationLinkBlock = defineNavBlock({
  name: "nav-verification-link",
  checkpoint: Home,
  url: (mem) => mem.get(MailpitKeys.emailLink).url,
  verify: [HomeRead.verified.is(true)],
});
