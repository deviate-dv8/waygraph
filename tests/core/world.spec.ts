import { test, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { checkpoint, defineMethodBlock, defineNavBlock, Engine, MemPage, type Trait } from "../../src/index.js";

const Home = checkpoint("Home");
/** A fake app: shows its time zone and what GET /api/orders answered. */
async function serveApp(page: Page): Promise<void> {
  await page.context().route("https://app.test/api/orders", (route) => route.fulfill({ status: 200, body: "[]" }));
  await page.context().route("https://app.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<p id="tz"></p><p id="orders"></p><script>
        document.getElementById("tz").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
        fetch("/api/orders").then((r) => r.status, () => "failed").then((s) => { document.getElementById("orders").textContent = String(s); });
      </script>`,
    }),
  );
}
const shows = (sel: string, text: string): Trait => ({ name: `${sel}=${text}`, wants: text, async check(page) { const t = await page.locator(sel).textContent(); return { ok: t === text, saw: t ?? "" }; } });
const open = (verify: Trait[]) => defineNavBlock({ name: "open", checkpoint: Home, url: "https://app.test/" }).withVerify(verify);
const engine = new Engine();
const tzOf = (page: Page) => page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

test("a flow runs in its time zone with its faults, and both are put back when it ends", async ({ page }) => {
  await serveApp(page);
  await page.goto("https://app.test/");
  const before = await tzOf(page);
  const flow = engine
    .map({ timezone: "Asia/Tokyo", network: { faults: [{ url: "**/api/orders", status: 503 }] } })
    .gotoPage(open([shows("#tz", "Asia/Tokyo"), shows("#orders", "503")]))
    .end();
  await flow.run(page.context(), new MemPage(), { page });
  expect(flow.blocks().at(-1)).toMatchObject({ name: "restore-world", cleanup: true });
  await page.reload();
  expect(await tzOf(page)).toBe(before);
  await expect(page.locator("#orders")).toHaveText("200");
});

test("an offline flow sees its requests fail; the network is back after it", async ({ page }) => {
  // A real server: offline mode cuts the network, and a routed (fulfilled) request never reaches it.
  const server = createServer((req, res) => res.end(req.url === "/api/orders" ? "[]" : "<p>app</p>"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await page.goto(origin);
    const status = () => page.evaluate(() => fetch("/api/orders").then((r) => String(r.status), () => "failed"));
    const fetchFails: Trait = { name: "orders-fetch", wants: "a failed fetch", async check() { const got = await status(); return { ok: got === "failed", saw: got }; } };
    const flow = engine
      .map({ network: { throttle: "offline" } })
      .method(defineMethodBlock({ name: "load-orders", to: Home, instruction: { async act() {}, verify: [fetchFails] } }))
      .end();
    await flow.run(page.context(), new MemPage(), { page });
    expect(await status()).toBe("200");
  } finally {
    server.close();
  }
});

test("a throttled flow's requests are slow; normal speed after it", async ({ page }) => {
  const server = createServer((_req, res) => res.end("ok"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await page.goto(origin);
    const timed = () => page.evaluate(async () => { const t = performance.now(); await fetch("/x?" + Math.random()); return performance.now() - t; });
    let during = 0;
    const flow = engine
      .map({ network: { throttle: { latencyMs: 800, downloadKbps: 10_000, uploadKbps: 10_000 } } })
      .method(defineMethodBlock({ name: "load", to: Home, instruction: { async act() { during = await timed(); } } }))
      .end();
    await flow.run(page.context(), new MemPage(), { page });
    expect(during).toBeGreaterThanOrEqual(750);
    expect(await timed()).toBeLessThan(400);
  } finally {
    server.close();
  }
});
