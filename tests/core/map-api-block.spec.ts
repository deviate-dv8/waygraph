import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { Engine, MemPage, checkpoint, defineApiBlock } from "../../src/index.js";

const Healthy = checkpoint("Healthy");
const Down = checkpoint("Down");

test("an API Block goes into map().method(), lands on its to, and records its route", async ({ context }) => {
  const server = createServer((req, res) => {
    res.statusCode = req.url === "/health" ? 200 : 500;
    res.end(JSON.stringify({ ok: req.url === "/health" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const Check = (path: string) =>
      defineApiBlock({
        name: `check${path.replace("/", "-")}`,
        to: [Healthy, Down],
        call: ({ request }) => request.get(base + path),
        resolve: (r) => (r.ok ? Healthy : Down),
      });
    const engine = new Engine();
    const page = await context.newPage();
    const up = await engine.map().start().method(Check("/health")).end().run(context, new MemPage(), { page, closeOnFinish: false });
    const down = await engine.map().start().method(Check("/broken")).end().run(context, new MemPage(), { page, closeOnFinish: false });
    expect(up.result).toEqual(Healthy);
    expect(down.result).toEqual(Down);

    const Single = defineApiBlock({ name: "ping", to: Healthy, call: ({ request }) => request.get(base + "/health") });
    const route = Single as unknown as { __waygraphFrom: string[]; __waygraphTo: string[] };
    expect([route.__waygraphFrom, route.__waygraphTo]).toEqual([["*"], ["Healthy"]]);
    const single = await engine.map().start().method(Single).end().run(context, new MemPage(), { page, closeOnFinish: false });
    expect(single.result).toEqual(Healthy);
  } finally {
    server.close();
  }
});
