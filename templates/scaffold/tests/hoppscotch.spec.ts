import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { MemPage, checkpoint } from "waygraph";
import { hoppscotchGetFlow } from "../src/flows/hoppscotch-get.flow.js";
import { hoppscotchPostFlow } from "../src/flows/hoppscotch-post.flow.js";
import {
  ExpectedResponseText,
  ExpectedStatus,
  RequestBody,
  RequestHeaders,
  RequestMethod,
  RequestUrl,
} from "../src/states/demo.mem-keys.js";

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
      res.end(JSON.stringify({ method: req.method, token: req.headers["x-token"], body }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/items`;
});

test.afterAll(() => server.close());

test.skip(!process.env.WAYGRAPH_EXTENSIONS, 'add extensions: ["hoppscotch"] to waygraph.config.ts to run these');
test.setTimeout(120_000);

test("GET returns 200", async () => {
  const mem = new MemPage();
  mem.set(RequestUrl, apiUrl);
  mem.set(ExpectedStatus, 200);
  expect(await hoppscotchGetFlow.run(mem, {})).toEqual(checkpoint("HoppscotchRest"));
});

test("POST sends the header and JSON body, returns 201", async () => {
  const mem = new MemPage();
  mem.set(RequestMethod, "POST");
  mem.set(RequestUrl, apiUrl);
  mem.set(RequestHeaders, { "x-token": "abc123" });
  mem.set(RequestBody, '{"name":"waygraph"}');
  mem.set(ExpectedStatus, 201);
  mem.set(ExpectedResponseText, '"token":"abc123"');
  expect(await hoppscotchPostFlow.run(mem, {})).toEqual(checkpoint("HoppscotchRest"));
});

test("a wrong expected status fails the flow, naming assert-status", async () => {
  const mem = new MemPage();
  mem.set(RequestUrl, apiUrl);
  mem.set(ExpectedStatus, 404);
  await expect(hoppscotchGetFlow.run(mem, {})).rejects.toThrow(/assert-status/);
});

test("a response body without the expected text fails the flow, naming assert-response-body", async () => {
  const mem = new MemPage();
  mem.set(RequestMethod, "POST");
  mem.set(RequestUrl, apiUrl);
  mem.set(RequestHeaders, { "x-token": "abc123" });
  mem.set(RequestBody, '{"name":"waygraph"}');
  mem.set(ExpectedStatus, 201);
  mem.set(ExpectedResponseText, '"token":"nope"');
  await expect(hoppscotchPostFlow.run(mem, {})).rejects.toThrow(/assert-response-body/);
});
