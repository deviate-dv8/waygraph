import { defineNavBlock, Trait } from "waygraph";
import type { Home } from "../../../states/demo.states.js";
import { DemoSel, HOME_URL } from "./_sel.js";

/**
 * Kind: Nav
 * Helper: defineNavBlock
 * Route: (app_base)/home/  (synthetic "/")
 */
export const NavHomeBlock = defineNavBlock<Home>({
  name: "nav-home",
  description: "Opens the offline catalog page (file://, no server).",
  checkpoint: "Home",
  url: HOME_URL,
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.catalog)],
})
  .stubAfter((ctx) => {
    ctx.ring("title", { selector: DemoSel.title, label: "Home heading", duration: true });
  })
  .stubOnError((ctx) => {
    ctx.ring("title", { selector: DemoSel.title, label: "Home heading at failure" });
  });
