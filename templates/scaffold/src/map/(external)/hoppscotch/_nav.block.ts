import { defineNavBlock, Trait } from "waygraph";
import { HoppscotchRest } from "../../../states/demo.states.js";
import { HoppscotchSel } from "./_sel.js";

export const NavHoppscotchRestBlock = defineNavBlock({
  name: "nav-hoppscotch-rest",
  checkpoint: HoppscotchRest,
  // Cross-origin, so a function: the Map folder rule only checks static URLs.
  url: () => "https://hoppscotch.io/",
  verify: [Trait.visible(HoppscotchSel.send)],
});
