import { defineNavBlock, Trait } from "waygraph";
import type { Home } from "../../../states/demo.states.js";
import { DemoSel, HOME_URL } from "./_sel.js";

export const NavHomeBlock = defineNavBlock<Home>({
  name: "nav-home",
  description: "Opens the offline catalog page (file://, no server).",
  checkpoint: "Home",
  url: HOME_URL,
  verify: [Trait.text(DemoSel.title, "Hello Waygraph"), Trait.visible(DemoSel.catalog)],
});
