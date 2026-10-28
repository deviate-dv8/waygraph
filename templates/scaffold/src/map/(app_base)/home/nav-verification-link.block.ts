import { defineNavBlock, Trait } from "waygraph";
import { HomeVerified } from "../../../states/demo.states.js";
import { MailpitKeys } from "../../(external)/mailpit/_keys.js";
import { DemoSel } from "./_sel.js";

/** Follows the link `extract-email-link` put in mem. No `requires`: an earlier Block in the chain produces it. */
export const NavVerificationLinkBlock = defineNavBlock({
  name: "nav-verification-link",
  checkpoint: HomeVerified,
  url: (mem) => mem.get(MailpitKeys.emailLink).url,
  verify: [Trait.visible(DemoSel.verifiedBanner)],
});
