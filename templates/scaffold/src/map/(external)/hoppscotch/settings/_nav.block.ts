import { defineNavBlock, Trait } from "waygraph";
import { HoppscotchSettings } from "../_states.js";
import { HoppscotchSel } from "../_sel.js";

export const NavHoppscotchSettingsBlock = defineNavBlock({
  name: "nav-hoppscotch-settings",
  checkpoint: HoppscotchSettings,
  url: () => "https://hoppscotch.io/settings",
  verify: [Trait.visible(HoppscotchSel.interceptorHeading)],
});
