import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Engine, MemPage, checkpoint, definePageBlock, Trait } from "../../src/index.js";

const Docs = checkpoint("PoQueryDocs");
let base = "";
const server = createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  res.setHeader("content-type", "text/html");
  res.end(`<h1 id="t">${u.pathname} ${u.searchParams.get("tab") ?? "-"}</h1>`);
});
test.beforeAll(async () => {
  await new Promise<void>((d) => server.listen(0, "127.0.0.1", d));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => new Promise<void>((d) => server.close(() => d())));

test("go opens with query params, setQuery changes them, and both prove the address", async ({ context, page }) => {
  const DocsPage = definePageBlock({ name: "page-po-query", checkpoint: Docs, url: `${base}/docs/:id`, query: ["tab"], verify: [Trait.visible("#t")] });
  const engine = new Engine();
  const flow = engine.map().gotoPage(DocsPage.go({ id: 7, tab: "files" }).withVerify([Trait.text("#t", "/docs/7 files")])).method(DocsPage.setQuery({ tab: "signers" }).withVerify([Trait.text("#t", "/docs/7 signers")]));
  await page.goto(base + "/");
  const prev = process.env["WAYGRAPH_BASE_URL"];
  process.env["WAYGRAPH_BASE_URL"] = base;
  try {
    await flow.run(context, new MemPage(), { page });
  } finally {
    if (prev === undefined) delete process.env["WAYGRAPH_BASE_URL"];
    else process.env["WAYGRAPH_BASE_URL"] = prev;
  }
  expect(page.url()).toBe(`${base}/docs/7?tab=signers`);
});
