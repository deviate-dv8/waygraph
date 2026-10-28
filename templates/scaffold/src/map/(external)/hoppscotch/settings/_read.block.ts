import { defineReadBlock } from "waygraph";
import { HoppscotchSettings } from "../_states.js";
import { HoppscotchSel } from "../_sel.js";
import { HoppscotchSettingsRead } from "./_reads.js";

/** The settings page as data: whether the extension interceptor can be picked. */
export const HoppscotchSettingsReadBlock = defineReadBlock({
  name: "read-hoppscotch-settings",
  description: "Whether the browser-extension interceptor is offered.",
  from: [HoppscotchSettings],
  instruction: { read: (ctx) => HoppscotchSettingsRead({ extensionInterceptor: ctx.page.visible(HoppscotchSel.extensionInterceptor) }) },
});
