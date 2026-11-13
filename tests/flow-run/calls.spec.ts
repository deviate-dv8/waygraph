import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkpoint, defineApiBlock, defineMethodBlock, Engine, MemPage, onRunEvent } from "../../src/index.js";
import type { RunEvent } from "../../src/index.js";
import { callsIdle } from "../../src/engine/run/calls.js";
import { installRunLog } from "../../src/runtime/run-log.js";

const Start = checkpoint("CallsStart");
const Loaded = checkpoint("CallsLoaded");
const Seeded = checkpoint("CallsSeeded");

const listen = (handler: Parameters<typeof createServer>[1]) =>
  new Promise<{ server: Server; origin: string }>((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` }));
  });

test("a run records each step's calls with bodies masked, and leaves other origins marked", async ({ browser }) => {
  const dir = mkdtempSync(join(tmpdir(), "wg-calls-"));
  process.env["WAYGRAPH_RUN_LOG"] = dir;
  installRunLog();
  const other = await listen((_req, res) => void res.writeHead(204, { "access-control-allow-origin": "*" }).end());
  const app = await listen((req, res) => {
    const url = req.url ?? "/";
    if (url === "/") {
      res.writeHead(200, { "content-type": "text/html" }).end(`<script>
        const get = (u, o) => fetch(u, o).then((r) => r.text());
        Promise.all([get("/api/items/1"), get("/api/items/2"), get("/api/fail"), get("${other.origin}/beacon", { mode: "cors" })]).then(() => document.title = "done");
      </script>`);
    } else if (url.startsWith("/api/items/")) {
      res.writeHead(200, { "content-type": "application/json", etag: "x" }).end(JSON.stringify({ id: 1, token: "secret-value", name: "Bike" }));
    } else if (url === "/api/seed") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id: 7, echoed: JSON.parse(body) })));
    } else res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ message: "boom" }));
  });
  const load = defineMethodBlock({
    name: "load-page",
    from: Start,
    to: Loaded,
    instruction: {
      async act(page) {
        await page.goto(app.origin);
        await page.waitForFunction(() => document.title === "done");
      },
    },
  });
  const seed = defineApiBlock({
    name: "seed-item",
    from: Loaded,
    to: Seeded,
    method: "POST",
    call: ({ request }) => request.post(`${app.origin}/api/seed`, { data: { title: "x", password: "hunter2" } }),
  });
  const events: RunEvent[] = [];
  const off = onRunEvent((e) => events.push(e));
  const context = await browser.newContext();
  try {
    await new Engine().map().method(load as never).method(seed as never).run(context, new MemPage());
    await callsIdle(3000);
  } finally {
    off();
    await context.close();
    app.server.close();
    other.server.close();
  }
  const calls = events.filter((e): e is Extract<RunEvent, { type: "step:call" }> => e.type === "step:call");
  const page = calls.filter((c) => c.source === "page");
  expect(page.map((c) => `${c.method} ${c.route} ${c.status}`).sort()).toEqual(["GET /api/fail 500", "GET /api/items/:id 200", "GET /api/items/:id 200", "GET /beacon 204"]);
  expect(page.every((c) => c.index === 0)).toBe(true);
  expect(page.find((c) => c.route === "/beacon")?.external).toBe(true);
  expect(page.find((c) => c.route === "/api/fail")?.failed).toBe(true);
  expect(page.find((c) => c.route === "/api/items/:id")?.cacheable).toBe(true);
  const api = calls.find((c) => c.source === "api");
  expect(api).toMatchObject({ method: "POST", route: "/api/seed", status: 201, index: 1, failed: false });
  const kept = JSON.parse(readFileSync(api?.body ?? "", "utf8"));
  expect(kept.request.body).toEqual({ title: "x", password: "••••" });
  expect(kept.response.body).toEqual({ id: 7, echoed: { title: "x", password: "••••" } });
  const item = JSON.parse(readFileSync(page.find((c) => c.route === "/api/items/:id")?.body ?? "", "utf8"));
  expect(item.response.body.token).toBe("••••");
  expect(existsSync(join(dir, events[0]?.runId ?? "", "calls"))).toBe(true);
  expect(events.some((e) => e.type === "run:artifact" && e.kind === "call")).toBe(true);
});
