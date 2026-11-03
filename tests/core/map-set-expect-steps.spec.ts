import { test, expect } from "@playwright/test";
import { checkpoint, defineMethodBlock, defineReadBlock, Engine, MemPage, keys, reads, registerMemStub, Start, steps } from "../../src/index.js";


const List = checkpoint("SetExpectList");
const Detail = checkpoint("SetExpectDetail");

const K = keys("setExpect")<{ search: string; machine: { code: string }; stubbed: string }>();
const Shown = reads("setExpectShown")<{ rows: string[]; status: string }>();
defineReadBlock({
  name: "read-set-expect",
  from: [List, Detail],
  instruction: { read: (ctx) => Shown({ rows: ctx.page.texts("li"), status: ctx.page.text("#status") }) },
});

const typed: string[] = [];
const open = defineMethodBlock({
  name: "open-list",
  from: Start,
  to: List,
  instruction: { async act(page) { await page.setContent(`<input id="q"><ul><li>MCH-1</li><li>MCH-2</li></ul><p id="status">Down</p>`); } },
});
const search = defineMethodBlock({
  name: "search-list",
  from: List,
  to: List,
  requires: [K.search],
  instruction: {
    async act(page, _in, mem) {
      typed.push(mem.get(K.search));
      await page.locator("#q").fill(mem.get(K.search));
    },
  },
});
const view = defineMethodBlock({ name: "view-row", from: List, to: Detail, instruction: { async act() {} } });
const back = defineMethodBlock({ name: "back-to-list", from: Detail, to: List, instruction: { async act() {} } });
const engine = new Engine();

test.beforeEach(() => {
  typed.length = 0;
});

test(".set gives the next step its key, a value or one worked out from mem; the run no longer has to supply it", async ({ page }) => {
  const flow = engine
    .map()
    .method(open)
    .set(K.search, "MCH-1")
    .method(search)
    .set(K.search, (mem) => mem.get(K.machine).code)
    .method(search);
  const required = flow.blocks().flatMap((b) => b.block.requires ?? []).map((k) => k.name);
  expect(required).toEqual([]);
  const mem = new MemPage().set(K.machine, { code: "MCH-2" });
  expect(await flow.run(page.context(), mem, { page })).toEqual(List);
  expect(typed).toEqual(["MCH-1", "MCH-2"]);
});

test(".expect checks what the page shows: a value, or a test that also gets mem", async ({ page }) => {
  const flow = engine
    .map()
    .method(open)
    .expect(Shown.rows, ["MCH-1", "MCH-2"])
    .expect(Shown.status, "Down")
    .expect(Shown.rows, (rows, mem) => rows.includes(mem.get(K.machine).code), "the machine's row");
  expect(await flow.run(page.context(), new MemPage().set(K.machine, { code: "MCH-2" }), { page })).toEqual(List);
  await expect(flow.run(page.context(), new MemPage().set(K.machine, { code: "MCH-9" }), { page })).rejects.toThrow(
    /wanted the machine's row; saw \["MCH-1","MCH-2"\]/,
  );
});

test("a failed .expect of a value says what it wanted", async ({ page }) => {
  const flow = engine.map().method(open).expect(Shown.status, "Operational");
  await expect(flow.run(page.context(), new MemPage(), { page })).rejects.toThrow(/wanted setExpectShown\.status = "Operational"; saw "Down"/);
});

test("steps() is a part several flows play, typed from its Checkpoint", async ({ page }) => {
  const findAndView = steps(List, (m) => m.set(K.search, "MCH-1").method(search).method(view));
  const flow = engine.map().method(open).steps(findAndView).method(back).steps(findAndView);
  expect(await flow.run(page.context(), new MemPage(), { page })).toEqual(Detail);
  expect(typed).toEqual(["MCH-1", "MCH-1"]);
  // A part from List doesn't fit a flow on Detail.
  // @ts-expect-error Detail is not List
  expect(() => engine.map().method(open).method(view).steps(findAndView)).toBeDefined();
});

test("a part isn't a flow on its own", () => {
  expect(() => steps(List, (m) => (m.method(search).blocks(), m))).toThrow(/isn't a flow on its own/);
});

test("map({ memStub: true }) fills missing keys from stubs when it runs; new Engine({ memStub: true }) does it for every flow", async ({ page }) => {
  registerMemStub(K.stubbed, () => "from-stub");
  const seen: string[] = [];
  const useStub = defineMethodBlock({
    name: "use-stub",
    from: Start,
    to: List,
    requires: [K.stubbed],
    instruction: { async act(_p, _i, mem) { seen.push(mem.get(K.stubbed)); } },
  });
  await engine.map({ memStub: true }).method(useStub).run(page.context(), new MemPage(), { page });
  await new Engine({ memStub: true }).map().method(useStub).run(page.context(), new MemPage().set(K.stubbed, "given"), { page });
  await expect(engine.map().method(useStub).run(page.context(), new MemPage(), { page })).rejects.toThrow(/setExpect\.stubbed/);
  expect(seen).toEqual(["from-stub", "given"]);
});
