import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { checkpoint, defineApiBlock, defineMethodBlock, Engine, MemPage, onRunEvent, type RunEvent } from "../../src/index.js";
import { playSteps } from "../../src/runner/play-steps.js";
import type { PlayStep } from "../../src/runner/mode.js";

const Done = checkpoint("Done");
const Seeded = checkpoint("Seeded");
const hits: string[] = [];
let server: Server;
let base = "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.statusCode = req.url?.includes("down") ? 500 : 200;
    res.end("{}");
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(() => server.close());
test.beforeEach(() => {
  hits.length = 0;
});

const seed = (name: string, path = name) =>
  defineApiBlock({
    name: `seed-${name}`,
    to: Seeded,
    call: ({ request }) => request.post(`${base}/${path}`),
    undo: ({ request }) => request.delete(`${base}/${path}`),
  });
const play = defineMethodBlock({ name: "play", from: checkpoint("__start__"), to: Done, instruction: { async act() { hits.push("play"); } } });
const engine = new Engine();

test("a flow's givens play before its steps and are undone after, last given first", async ({ page }) => {
  const events: RunEvent[] = [];
  const off = onRunEvent((e) => events.push(e));
  const flow = engine.map({ given: [seed("tenant"), seed("request")] }).method(play);
  await flow.run(page.context(), new MemPage(), { page });
  off();
  expect(hits).toEqual(["POST /tenant", "POST /request", "play", "DELETE /request", "DELETE /tenant"]);
  const starts = events.filter((e) => e.type === "step:start") as Extract<RunEvent, { type: "step:start" }>[];
  expect(starts.map((e) => [e.block, e.given ?? false, e.cleanup ?? false])).toEqual([
    ["seed-tenant", true, false],
    ["seed-request", true, false],
    ["play", false, false],
    ["undo-seed-request", false, true],
    ["undo-seed-tenant", false, true],
  ]);
  expect(flow.blocks().map((b) => [b.name, b.given ?? false, b.cleanup ?? false])).toEqual([
    ["seed-tenant", true, false],
    ["seed-request", true, false],
    ["play", false, false],
    ["undo-seed-request", false, true],
    ["undo-seed-tenant", false, true],
  ]);
});

test("a given that fails blocks the flow: no step plays, and only the givens that started are undone", async ({ page }) => {
  const flow = engine.map({ given: [seed("tenant"), seed("request", "down"), seed("report")] }).method(play);
  await expect(flow.run(page.context(), new MemPage(), { page })).rejects.toThrow(/WG_GIVEN_FAILED.*seed-request/);
  expect(hits).toEqual(["POST /tenant", "POST /down", "DELETE /down", "DELETE /tenant"]);
});

test("the runner blocks the run on a failed given, with the same error, and still undoes", async ({ page }) => {
  const flow = engine.map({ given: [seed("tenant"), seed("request", "down")] }).method(play);
  const steps: PlayStep[] = flow.blocks().map((info) => ({
    block: info.block,
    exportName: info.name,
    config: flow.config,
    resetSession: false,
    segment: 0,
    ...(info.cleanup ? { cleanup: true } : {}),
    ...(info.given ? { given: true } : {}),
    ...(info.block.name.startsWith("undo-") ? { undoOf: info.block.name.slice(5) } : {}),
  }));
  const outcome = await playSteps(steps, { context: page.context(), page: page as never, mem: new MemPage(), baseURL: undefined }, { name: "run" }, false);
  expect(outcome.ok).toBe(false);
  expect(String(outcome.failedAt?.error)).toContain("WG_GIVEN_FAILED");
  expect(hits).toEqual(["POST /tenant", "POST /down", "DELETE /down", "DELETE /tenant"]);
});

test("a nested flow's givens become the outer flow's", async ({ page }) => {
  const inner = engine.map({ given: [seed("tenant")] }).method(play);
  const outer = engine.map().flow(inner);
  await outer.run(page.context(), new MemPage(), { page });
  expect(hits).toEqual(["POST /tenant", "play", "DELETE /tenant"]);
});
