import { definePageBlock, Trait } from "waygraph";
import { Docs, Home } from "../../states/demo.states.js";
import { TopBarSel } from "./_sel.js";
import { DemoSel } from "./home/_sel.js";
import { DocsSel } from "./docs/_sel.js";

/** The top bar on every page of the app (every page in this folder and below): home and docs. A shell, no page of its own. */
export const TopBar = definePageBlock({
  name: "top-bar",
  description: "The bar on every page of the app.",
  covers: "children",
  links: (self) => ({
    home: self.link({ to: Home, click: TopBarSel.home, verify: [Trait.visible(DemoSel.catalog)] }),
    docs: self.link({ to: Docs, click: TopBarSel.docs, verify: [Trait.visible(DocsSel.heading)] }),
  }),
});
