import { defineNavBlock, Trait } from "waygraph";
import type { HomeVerified } from "../../../states/demo.states.js";
import { EmailLink } from "../../../states/demo.mem-keys.js";
import { DemoSel } from "./_sel.js";

/**
 * Kind: Nav
 * Helper: defineNavBlock
 * Route: (app_base)/home/
 *
 * Navigates back into the app to the link extract-email-link read out of
 * the real Mailpit message, then confirms the page actually reflects it
 * (the verified banner only appears when the exact `verified=1` link was
 * followed, not just any URL). This particular check is app-specific (this
 * scaffold's own verification landing route) even though the mail-reading
 * Blocks feeding it are scenario-agnostic - a real project would have one
 * such Nav per distinct landing route, same as any other app screen.
 *
 * Deliberately no `requires: [EmailLink.key]` here: `requires` means "the
 * caller must seed this externally before the flow starts" (preflight
 * checks the whole chain's requires up front) - `EmailLink` is instead
 * produced by an earlier Block in this very chain, so declaring it as a
 * requirement would make preflight fail before the flow ever gets the
 * chance to produce it. Engine support for declaring a mem key as "produced
 * by an earlier Block in this chain" (vs. externally supplied) is a
 * separate, not-yet-built roadmap item - see ROADMAP.md's "Split requires"
 * row.
 */
export const NavVerificationLinkBlock = defineNavBlock<HomeVerified>({
  name: "nav-verification-link",
  checkpoint: "HomeVerified",
  url: (mem) => mem.get(EmailLink.key).url,
  verify: [Trait.visible(DemoSel.verifiedBanner)],
});
