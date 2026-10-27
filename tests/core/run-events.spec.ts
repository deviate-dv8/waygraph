import { test, expect } from "@playwright/test";
import { checkpoint, defineMethodBlock, Engine, MemPage, onRunEvent } from "../../src/index.js";
import type { RunEvent } from "../../src/index.js";

const A = checkpoint("A");
const B = checkpoint("B");
const C = checkpoint("C");

const ab = defineMethodBlock({ name: "a-to-b", from: A, to: B, instruction: { async act() {} } });
const bc = defineMethodBlock({ name: "b-to-c", from: B, to: C, instruction: { async act() {} } });
const fails = defineMethodBlock({
  name: "fails",
  from: B,
  to: C,
  instruction: {
    async act() {
      throw new Error("boom");
    },
  },
});

async function collect(run: () => Promise<unknown>): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const off = onRunEvent((e) => events.push(e));
  try {
    await run().catch(() => {});
  } finally {
    off();
  }
  return events;
}

const fakeContext = { newPage: async () => ({ close: async () => {} }) } as never;

test("a run reports each Block it ran, in order, with where it went", async () => {
  const flow = new Engine().map().start().method(ab as never).method(bc as never).end();
  const events = await collect(() => flow.run(fakeContext, new MemPage()));
  expect(events.map((e) => e.type)).toEqual(["run:start", "step:start", "step:end", "step:start", "step:end", "run:end"]);
  const ends = events.filter((e) => e.type === "step:end") as Extract<RunEvent, { type: "step:end" }>[];
  expect(ends.map((e) => [e.block, e.to])).toEqual([["a-to-b", "B"], ["b-to-c", "C"]]);
  const end = events.at(-1) as Extract<RunEvent, { type: "run:end" }>;
  expect(end).toMatchObject({ ok: true, result: "C" });
  expect(new Set(events.map((e) => e.runId)).size).toBe(1);
});

test("a failing Block is reported as the step that failed", async () => {
  const flow = new Engine().map().start().method(ab as never).method(fails as never).end();
  const events = await collect(() => flow.run(fakeContext, new MemPage()));
  const error = events.find((e) => e.type === "step:error") as Extract<RunEvent, { type: "step:error" }>;
  expect(error).toMatchObject({ block: "fails", error: "boom", index: 1 });
  expect(events.at(-1)).toMatchObject({ type: "run:end", ok: false, error: "boom" });
});

test("a step's read waits for the page it landed on to render (a client route: URL first, content later)", async ({ page }) => {
  const { defineReadBlock, reads } = await import("../../src/beta.js");
  const Routed = checkpoint("RoutedPage");
  const Shown = reads("routed")<{ heading: string; items: string[] }>();
  defineReadBlock({ name: "read-routed", from: Routed, instruction: { read: (ctx) => Shown({ heading: ctx.page.text("h1"), items: ctx.page.texts("li") }) } });
  const go = defineMethodBlock({
    name: "go-routed",
    from: A,
    to: Routed,
    instruction: {
      async act(p) {
        // Like a client-side router: the URL changes at once, the new content renders a moment later.
        await p.evaluate(() => {
          history.pushState({}, "", "#/routed");
          setTimeout(() => (document.body.innerHTML = "<h1>Routed</h1><ul><li>one</li><li>two</li></ul>"), 120);
        });
      },
    },
  });
  await page.setContent("<h1>Old page</h1>");
  const flow = new Engine().map().start().method(go as never).end();
  const events = await collect(() => flow.run(page.context(), new MemPage(), { page }));
  const read = events.find((e) => e.type === "step:read") as Extract<RunEvent, { type: "step:read" }>;
  expect(read).toMatchObject({ block: "go-routed", checkpoint: "RoutedPage", read: { routed: { heading: "Routed", items: ["one", "two"] } }, missing: [] });
  expect(events.map((e) => e.type)).toEqual(["run:start", "step:start", "step:read", "step:end", "run:end"]);
});
