import { definePageBlock } from "waygraph";
import { HoppscotchSettings } from "../_states.js";
import { HoppscotchSel } from "../_sel.js";
import { } from "./_reads.js";

export const HoppscotchSettingsPage = definePageBlock({
  name: "page-hoppscotch-settings",
  description: "Whether the browser-extension interceptor is offered.",
  checkpoint: HoppscotchSettings,
  read: (ctx) => ({ extensionInterceptor: ctx.page.visible(HoppscotchSel.extensionInterceptor) }),
});
