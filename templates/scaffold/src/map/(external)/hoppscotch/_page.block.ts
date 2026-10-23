import { definePageBlock, Trait } from "waygraph";
import { HoppscotchRest } from "./_states.js";
import { SetMethodBlock } from "./_methods/set-method.method.block.js";
import { SetUrlBlock } from "./_methods/set-url.method.block.js";
import { SetHeadersBlock } from "./_methods/set-headers.method.block.js";
import { SetJsonBodyBlock } from "./_methods/set-json-body.method.block.js";
import { SendRequestBlock } from "./_methods/send-request.method.block.js";
import { AssertStatusBlock } from "./_methods/assert-status.method.block.js";
import { ReadResponseBodyBlock } from "./_methods/read-response-body.method.block.js";
import { AssertResponseBodyBlock } from "./_methods/assert-response-body.method.block.js";
import { SetQueryParamsBlock } from "./_methods/set-query-params.method.block.js";
import { SetBearerTokenBlock } from "./_methods/set-bearer-token.method.block.js";
import { ReadResponseHeadersBlock } from "./_methods/read-response-headers.method.block.js";
import { AssertResponseHeaderBlock } from "./_methods/assert-response-header.method.block.js";
import { HoppscotchSel } from "./_sel.js";

export const HoppscotchRestPageBlock = definePageBlock({
  name: "page-hoppscotch-rest",
  description: "Hoppscotch REST client - build a request, send it, check the response.",
  checkpoint: HoppscotchRest,
  verify: [Trait.visible(HoppscotchSel.send)],
  methods: {
    setMethod: () => SetMethodBlock,
    setUrl: () => SetUrlBlock,
    setHeaders: () => SetHeadersBlock,
    setQueryParams: () => SetQueryParamsBlock,
    setBearerToken: () => SetBearerTokenBlock,
    setJsonBody: () => SetJsonBodyBlock,
    sendRequest: () => SendRequestBlock,
    assertStatus: () => AssertStatusBlock,
    readResponseHeaders: () => ReadResponseHeadersBlock,
    assertResponseHeader: () => AssertResponseHeaderBlock,
    readResponseBody: () => ReadResponseBodyBlock,
    assertResponseBody: () => AssertResponseBodyBlock,
  },
});
