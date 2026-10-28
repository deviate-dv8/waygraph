import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { Engine, MemPage, checkpoint, defineNavBlock, defineMethodBlock, defineAssertBlock, keys } from "../../src/index.js";


const Open = defineNavBlock({ name: "open", checkpoint: checkpoint("Page1"), url: "/" });
const Remember = defineMethodBlock({
  name: "remember",
  from: checkpoint("Page1"),
  to: checkpoint("Page1"),
  instruction: {
    async act(page) {
      await page.evaluate(() => localStorage.setItem("who", "ada"));
    },
    resolve: () => checkpoint("Page1"),
  },
});
const Seen = (expected: string | null) =>
  defineAssertBlock({
    name: `seen-${expected}`,
    checkpoint: checkpoint("Page1"),
    verify: [{ name: "who", check: async (page) => (await page.evaluate(() => localStorage.getItem("who"))) === expected }],
  });

test("map().flow() nests a flow inline; { reset: true } clears storage before it", async ({ context }) => {
  const server = createServer((_, res) => res.end("<html><body>x</body></html>"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const engine = new Engine();
    const OpenAt = defineNavBlock({ name: "open-at", checkpoint: checkpoint("Page1"), url: () => base + "/" });
    const first = engine.map().start().gotoPage(OpenAt).method(Remember).assert(Seen("ada")).end();
    const carried = engine.map().start().flow(first).assert(Seen("ada")).end();
    const reset = engine.map().start().flow(first).flow(engine.map().start().gotoPage(OpenAt).end(), { reset: true }).assert(Seen(null)).end();

    const page = await context.newPage();
    await carried.run(context, new MemPage(), { page, closeOnFinish: false });
    await reset.run(context, new MemPage(), { page, closeOnFinish: false });
    expect(Open.name).toBe("open");
    const infos = reset.blocks();
    expect(infos.filter((b) => (b as { resetSessionBefore?: boolean }).resetSessionBefore).length).toBe(1);
  } finally {
    server.close();
  }
});

test("map({ memStub, expectedFailure, demoPace }) puts the settings on the flow", () => {
  const flow = new Engine().map({ memStub: true, expectedFailure: "locked out", demoPace: "fast" }).start().gotoPage(Open).end();
  expect(flow.memStub).toBe(true);
  expect(flow.expectedFailureReason).toBe("locked out");
  expect(flow.demoPace).toBe("fast");
});

test("{ reset: true, input } resets before the whole sub-flow, its input step included", () => {
  const engine = new Engine();
  const Item = keys("probe")<{ item: string }>();
  const sub = engine.map({ input: Item.item }).gotoPage(Open).method(Remember).end();
  const infos = engine.map().flow(sub, { reset: true, input: "x" }).end().blocks();
  expect(infos.map((b) => `${b.name}:${!!b.resetSessionBefore}`)).toEqual(["input-open:true", "open:false", "remember:false"]);
});
