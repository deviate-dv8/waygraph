import { definePageBlock, Trait } from "waygraph";
import { HoppscotchRest } from "./_states.js";
import { HoppscotchSel } from "./_sel.js";
import { HoppscotchKeys } from "./_keys.js";
import { setMethod } from "./_methods/set-method.method.block.js";
import { setUrl } from "./_methods/set-url.method.block.js";
import { setHeaders } from "./_methods/set-headers.method.block.js";
import { setQueryParams } from "./_methods/set-query-params.method.block.js";
import { setBearerToken } from "./_methods/set-bearer-token.method.block.js";
import { sendRequest } from "./_methods/send-request.method.block.js";
import { readResponseHeaders } from "./_methods/read-response-headers.method.block.js";
import { readResponseBody } from "./_methods/read-response-body.method.block.js";

const spansLines = (text: string): boolean => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2).includes("\n");
  } catch {
    return false;
  }
};
const squash = (text: string): string => text.replace(/\s+/g, "");
const bodyContainsExpected: Trait = {
  name: "response-body-contains-expected",
  async check(_page, mem) {
    return squash(mem.get(HoppscotchKeys.responseBody)).includes(squash(mem.get(HoppscotchKeys.expectedResponseText)));
  },
};
const headerMatches: Trait = {
  name: "response-header-matches",
  async check(_page, mem) {
    const { name, value } = mem.get(HoppscotchKeys.expectedResponseHeader);
    return mem.get(HoppscotchKeys.responseHeaders)[name.toLowerCase()] === value;
  },
};
const statusMatches: Trait = {
  name: "response-status-matches",
  async check(page, mem) {
    const text = (await page.locator(HoppscotchSel.status).first().textContent()) ?? "";
    return Number(text.match(/Status:\s*(\d+)/)?.[1]) === mem.get(HoppscotchKeys.expectedStatus);
  },
};






export const HoppscotchRestPage = definePageBlock({
  name: "page-hoppscotch-rest",
  description: "Hoppscotch REST client - build a request, send it, check the response.",
  checkpoint: HoppscotchRest,
  url: () => "https://hoppscotch.io/",
  verify: [Trait.visible(HoppscotchSel.send)],
  read: (ctx) => ({ status: ctx.page.text(HoppscotchSel.status), body: ctx.page.text(HoppscotchSel.responseEditor) }),
  readAs: "hoppscotch",
  do: (self) => ({
    setMethod: setMethod(self),
    setUrl: setUrl(self),
    setHeaders: setHeaders(self),
    setQueryParams: setQueryParams(self),
    setBearerToken: setBearerToken(self),
    setJsonBody: self.method({
      name: "set-json-body",
      description: "Sets the content type to application/json and types the mem-supplied body, prettified.",
      requires: [HoppscotchKeys.requestBody],
      async act(page, _in, mem) {
        await page.locator(HoppscotchSel.tab("Body")).click();
        await page.locator(HoppscotchSel.contentTypeMenu).click();
        await page.locator(HoppscotchSel.menuItem("application/json")).click();
        const editor = page.locator(HoppscotchSel.visibleEditor).last();
        await editor.click();
        const body = mem.get(HoppscotchKeys.requestBody);
        await page.keyboard.type(body);
        if (!spansLines(body)) return;
        // Prettify is the third toolbar button (Clear, Wrap lines, Prettify); typed JSON stays on one line otherwise.
        await page.locator(HoppscotchSel.bodyToolbarButton).nth(2).click();
        if ((await editor.locator(HoppscotchSel.bodyLine).count()) < 2) {
          throw new Error("set-json-body: Hoppscotch's Prettify button was not found, so the body stayed on one line");
        }
      },
    }),
    sendRequest: sendRequest(self),
    readResponseHeaders: readResponseHeaders(self),
    readResponseBody: readResponseBody(self),
  }),
  expects: (self) => ({
  responseBody: self.expect({
  name: "expect-response-body",
  description: "Confirms the response body read earlier contains the mem-supplied text (whitespace ignored).",
  requires: [HoppscotchKeys.expectedResponseText],
  verify: [bodyContainsExpected],
  }),
  responseHeader: self.expect({
  name: "expect-response-header",
  description: "Confirms a response header read earlier has the mem-supplied value.",
  requires: [HoppscotchKeys.expectedResponseHeader],
  verify: [headerMatches],
  }),
  status: self.expect({
  name: "expect-status",
  description: "Confirms the response status code equals the mem-supplied one.",
  requires: [HoppscotchKeys.expectedStatus],
  verify: [statusMatches],
  }),
  })
});
