import { definePageBlock, Trait } from "waygraph";
import { HoppscotchSel } from "../_sel.js";
import { openRest } from "./_methods/open-rest.method.block.js";
import { pickExtensionInterceptor } from "./_methods/pick-extension-interceptor.method.block.js";

export const HoppscotchSettingsPage = definePageBlock({
  name: "page-hoppscotch-settings",
  description: "Whether the browser-extension interceptor is offered.",
  checkpoint: "HoppscotchSettings",
  url: () => "https://hoppscotch.io/settings",
  verify: [Trait.visible(HoppscotchSel.settingsHeading)],
  read: (ctx) => ({ extensionInterceptor: ctx.page.visible(HoppscotchSel.extensionInterceptor) }),
  do: (self) => ({ pickExtensionInterceptor: pickExtensionInterceptor(self), openRest: openRest(self) }),
});
