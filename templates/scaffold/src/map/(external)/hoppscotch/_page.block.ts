import { definePageBlock, Trait } from "waygraph";
import type { HoppscotchRest } from "../../../states/demo.states.js";
import { SendRequestBlock } from "./_methods/send-request.method.block.js";
import { AssertResponseOkBlock } from "./_methods/assert-response-ok.method.block.js";
import { HoppscotchSel } from "./_sel.js";

export const HoppscotchRestPageBlock = definePageBlock<HoppscotchRest>({
  name: "page-hoppscotch-rest",
  description: "Hoppscotch REST client - send a request, check the response.",
  checkpoint: "HoppscotchRest",
  verify: [Trait.visible(HoppscotchSel.send)],
  methods: {
    sendRequest: () => SendRequestBlock,
    assertResponseOk: () => AssertResponseOkBlock,
  },
});
