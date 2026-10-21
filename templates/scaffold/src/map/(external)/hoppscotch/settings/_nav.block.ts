import { defineNavBlock, Trait } from "waygraph";
import type { HoppscotchSettings } from "../../../../states/demo.states.js";
import { HoppscotchSel } from "../_sel.js";

export const NavHoppscotchSettingsBlock = defineNavBlock<HoppscotchSettings>({
  name: "nav-hoppscotch-settings",
  checkpoint: "HoppscotchSettings",
  url: () => "https://hoppscotch.io/settings",
  verify: [Trait.visible(HoppscotchSel.interceptorHeading)],
});
