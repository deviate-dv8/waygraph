import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { MemPage, checkpoint } from "waygraph";
import config from "../config/waygraph.config.js";
import { hoppscotchGetFlow } from "../src/flows/(external)/hoppscotch/get.flow.js";
import { hoppscotchAuthFlow } from "../src/flows/(external)/hoppscotch/auth.flow.js";
import { hoppscotchPostFlow } from "../src/flows/(external)/hoppscotch/post.flow.js";
import { HoppscotchKeys } from "../src/map/(external)/hoppscotch/_keys.js";

// The API under test: no CORS headers, so only the extension can reach it from hoppscotch.io.
let server: Server;
let apiUrl: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.statusCode = req.method === "POST" ? 201 : 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("x-request-id", "req-42");
      res.end(JSON.stringify({ method: req.method, url: req.url, token: req.headers["x-token"], auth: req.headers.authorization, body }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/items`;
});

test.afterAll(() => server.close());

test.skip(!config.extensions?.includes("hoppscotch"), 'add extensions: ["hoppscotch"] to config/waygraph.config.ts to run these');
test.setTimeout(120_000);

test("GET returns 200", async () => {
  const mem = new MemPage();
  mem.set(HoppscotchKeys.requestUrl, apiUrl);
  mem.set(HoppscotchKeys.expectedStatus, 200);
  expect(await hoppscotchGetFlow.run(mem, {})).toEqual(checkpoint("HoppscotchRest"));
});

test("POST sends the header and JSON body, returns 201", async () => {
  const mem = new MemPage();
  mem.set(HoppscotchKeys.requestMethod, "POST");
  mem.set(HoppscotchKeys.requestUrl, apiUrl);
  mem.set(HoppscotchKeys.requestHeaders, { "x-token": "abc123" });
  mem.set(HoppscotchKeys.requestBody, '{"name":"waygraph"}');
  mem.set(HoppscotchKeys.expectedStatus, 201);
  mem.set(HoppscotchKeys.expectedResponseText, '"token":"abc123"');
  expect(await hoppscotchPostFlow.run(mem, {})).toEqual(checkpoint("HoppscotchRest"));
});

test("a wrong expected status fails the flow, naming assert-status", async () => {
  const mem = new MemPage();
  mem.set(HoppscotchKeys.requestUrl, apiUrl);
  mem.set(HoppscotchKeys.expectedStatus, 404);
  await expect(hoppscotchGetFlow.run(mem, {})).rejects.toThrow(/assert-status/);
});

test("a response body without the expected text fails the flow, naming assert-response-body", async () => {
  const mem = new MemPage();
  mem.set(HoppscotchKeys.requestMethod, "POST");
  mem.set(HoppscotchKeys.requestUrl, apiUrl);
  mem.set(HoppscotchKeys.requestHeaders, { "x-token": "abc123" });
  mem.set(HoppscotchKeys.requestBody, '{"name":"waygraph"}');
  mem.set(HoppscotchKeys.expectedStatus, 201);
  mem.set(HoppscotchKeys.expectedResponseText, '"token":"nope"');
  await expect(hoppscotchPostFlow.run(mem, {})).rejects.toThrow(/assert-response-body/);
});

const authMem = (headerValue: string): MemPage => {
  const mem = new MemPage();
  mem.set(HoppscotchKeys.requestUrl, apiUrl);
  mem.set(HoppscotchKeys.requestParams, { q: "waygraph" });
  mem.set(HoppscotchKeys.requestBearerToken, "tok-9");
  mem.set(HoppscotchKeys.expectedStatus, 200);
  mem.set(HoppscotchKeys.expectedResponseText, '"url":"/items?q=waygraph","auth":"Bearer tok-9"');
  mem.set(HoppscotchKeys.expectedResponseHeader, { name: "X-Request-Id", value: headerValue });
  return mem;
};

test("query params and a bearer token reach the API; a response header is checked", async () => {
  expect(await hoppscotchAuthFlow.run(authMem("req-42"), {})).toEqual(checkpoint("HoppscotchRest"));
});

test("a wrong response header value fails the flow, naming assert-response-header", async () => {
  await expect(hoppscotchAuthFlow.run(authMem("other"), {})).rejects.toThrow(/assert-response-header/);
});
