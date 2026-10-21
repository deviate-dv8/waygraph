import { defineNavBlock, Trait } from "waygraph";
import type { HomeVerified } from "../../../states/demo.states.js";
import { EmailLink } from "../../../states/demo.mem-keys.js";
import { DemoSel } from "./_sel.js";

/** Follows the link `extract-email-link` put in mem. No `requires`: an earlier Block in the chain produces it. */
export const NavVerificationLinkBlock = defineNavBlock<HomeVerified>({
  name: "nav-verification-link",
  checkpoint: "HomeVerified",
  url: (mem) => mem.get(EmailLink.key).url,
  verify: [Trait.visible(DemoSel.verifiedBanner)],
});
