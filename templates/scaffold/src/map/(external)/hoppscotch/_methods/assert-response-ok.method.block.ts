import { defineAssertBlock, Trait } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { HoppscotchSel } from "../_sel.js";

export const AssertResponseOkBlock = defineAssertBlock<HoppscotchRest>({
  name: "assert-response-ok",
  description: "Confirms the response panel reports status 200.",
  checkpoint: "HoppscotchRest",
  verify: [Trait.visible(HoppscotchSel.statusOk)],
});
