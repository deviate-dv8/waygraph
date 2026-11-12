import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Engine, MemPage, definePageBlock, readCheckpoint } from "../../src/index.js";

test("a page's read can ask the app's API, as the page's own session", async ({ page }) => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== "Bearer t0k") res.statusCode = 401;
    res.end(JSON.stringify({ requestStatus: req.url?.endsWith("/42") ? "Completed" : "?" }));
  });
  await new Promise<void>((d) => server.listen(0, "127.0.0.1", d));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    new Engine({ api: { baseUrl: base, headers: async (p) => ({ authorization: `Bearer ${await p.evaluate(() => localStorage.getItem("accessToken"))}` }) } });
    definePageBlock({
      name: "page-po-api",
      checkpoint: "PoApi",
      read: (ctx) => ({ status: ctx.page.api((url) => `/requests/${url.pathname.split("/").pop()}`, (j) => (j as { requestStatus: string }).requestStatus) }),
    });
    await page.goto(`${base}/`).catch(() => undefined);
    await page.evaluate(() => localStorage.setItem("accessToken", "t0k"));
    await page.goto(`${base}/requests/42`).catch(() => undefined);
    const { read } = await readCheckpoint(page, new MemPage(), "PoApi");
    expect(read.toJSON()).toMatchObject({ poApi: { status: "Completed" } });
  } finally {
    server.close();
  }
});
