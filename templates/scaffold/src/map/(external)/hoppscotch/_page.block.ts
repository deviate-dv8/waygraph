import { definePageBlock, Trait } from "waygraph";
import { HoppscotchRest } from "./_states.js";
import { HoppscotchSel } from "./_sel.js";
import { HoppscotchKeys } from "./_keys.js";
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
  setMethod: self.method({
  name: "set-method",
  description: "Picks the HTTP method (GET, POST, PUT, PATCH, DELETE, ...) from the request bar.",
  requires: [HoppscotchKeys.requestMethod],
  async act(page, _in, mem) {
      await page.locator(HoppscotchSel.methodInput).click();
      await page.locator(HoppscotchSel.menuItem(mem.get(HoppscotchKeys.requestMethod))).click();
    },
  }),
  setUrl: self.method({
  name: "set-url",
  description: "Types the request URL into the request bar.",
  requires: [HoppscotchKeys.requestUrl],
  async act(page, _in, mem) {
      await page.locator(HoppscotchSel.urlInput).first().click();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(mem.get(HoppscotchKeys.requestUrl));
    },
  }),
  setHeaders: self.method({
  name: "set-headers",
  description: "Adds each mem-supplied header (name -> value) on the Headers tab.",
  requires: [HoppscotchKeys.requestHeaders],
  async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Headers")).click();
      const headers = Object.entries(mem.get(HoppscotchKeys.requestHeaders));
      for (const [i, [name, value]] of headers.entries()) {
        await page.locator(HoppscotchSel.keyCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(name);
        await page.locator(HoppscotchSel.valueCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(value);
      }
    },
  }),
  setQueryParams: self.method({
  name: "set-query-params",
  description: "Adds each mem-supplied query parameter (name -> value) on the Parameters tab.",
  requires: [HoppscotchKeys.requestParams],
  async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Parameters")).click();
      for (const [i, [name, value]] of Object.entries(mem.get(HoppscotchKeys.requestParams)).entries()) {
        await page.locator(HoppscotchSel.keyCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(name);
        await page.locator(HoppscotchSel.valueCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(value);
      }
    },
  }),
  setBearerToken: self.method({
  name: "set-bearer-token",
  description: "Sets the Authorization tab to Bearer and types the mem-supplied token.",
  requires: [HoppscotchKeys.requestBearerToken],
  async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Authorization")).click();
      await page.locator(HoppscotchSel.authTypeMenu).click();
      await page.locator(HoppscotchSel.menuItem("Bearer")).click();
      await page.locator(HoppscotchSel.bearerToken).locator(HoppscotchSel.editor).click();
      await page.keyboard.type(mem.get(HoppscotchKeys.requestBearerToken));
    },
  }),
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
  sendRequest: self.method({
  name: "send-request",
  description: "Sends the request and waits for the response status to appear.",
  async act(page) {
      await page.locator(HoppscotchSel.send).click();
      await page.locator(HoppscotchSel.status).waitFor({ timeout: 20_000 });
    },
  }),
  readResponseHeaders: self.method({
  name: "read-response-headers",
  description: "Reads the response headers (lower-cased names) into mem.",
  async act(page, _in, mem) {
      await page.locator(HoppscotchSel.responseHeadersTab).click();
      const cells = page.locator(HoppscotchSel.responseHeaderCell);
      await cells.first().waitFor();
      const texts = (await cells.allInnerTexts()).map((t) => t.trim());
      const headers: Record<string, string> = {};
      for (let i = 0; i + 1 < texts.length; i += 2) headers[texts[i]!.toLowerCase()] = texts[i + 1]!;
      mem.set(HoppscotchKeys.responseHeaders, headers);
    },
  }),
  readResponseBody: self.method({
  name: "read-response-body",
  description: "Reads the raw response body into mem.",
  async act(page, _in, mem) {
      await page.locator(HoppscotchSel.rawTab).click();
      const body = page.locator(HoppscotchSel.responseEditor);
      await body.waitFor();
      mem.set(HoppscotchKeys.responseBody, (await body.innerText()).trim());
      // Raw is the reliable place to read from; go back to the formatted JSON view so a recording ends on it.
      const json = page.locator(HoppscotchSel.responseJsonTab);
      if (await json.count()) await json.click();
    },
  }),
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
