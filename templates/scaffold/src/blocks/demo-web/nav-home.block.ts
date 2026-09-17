import { defineNavBlock, Trait } from "waygraph";
import { DemoSel, HOME_URL } from "./demo-sel.js";

/**
 * Kind: Nav
 * Helper: defineNavBlock
 * Route: demo-web/  (synthetic "/")
 */
export const NavHomeBlock = defineNavBlock({
  name: "nav-home",
  description: "Opens the offline catalog page (HTTP fixture :4177).",
  checkpoint: "Home",
  url: HOME_URL,
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.catalog)],
  stubBefore: {},
  stubAfter: {
    title: { selector: DemoSel.title, label: "Home heading", duration: true },
  },
  stubOnError: {
    title: { selector: DemoSel.title, label: "Home heading at failure" },
  },
});
