import { readEquals } from "../../src/engine/trait/trait.js";
import { test, expect } from "@playwright/test";
import {
  checkpoint,
  defineExpectBlock,
  defineMethodBlock,
  defineReadBlock,
  Engine,
  ExpectFailure,
  keys,
  MemPage,
  reads,
  Start,
  Trait,
  WaygraphError,
} from "../../src/index.js";

const Form = checkpoint("ExpectForm");
const Saved = checkpoint("ExpectSaved");
const Shown = reads("expectShown")<{ status: string; rows: string[] }>();
defineReadBlock({
  name: "read-expect-shown",
  from: [Form, Saved],
  instruction: { read: (ctx) => Shown({ status: ctx.page.text("#status"), rows: ctx.page.texts("li") }) },
});
const K = keys("expectSpec")<{ note: string }>();

const html = (status: string) => `<input id="name"><p id="status">${status}</p><ul><li>a</li><li>b</li></ul><p id="toast">Saved</p>`;
const open = defineMethodBlock({
  name: "expect-open",
  from: Start,
  to: Form,
  instruction: { async act(page) { await page.setContent(html("Draft")); } },
});
const ExpectToast = defineExpectBlock({
  name: "expect-toast",
  description: "The toast says Saved.",
  checkpoint: Saved,
  verify: [Trait.text("#toast", "Saved")],
});
const ExpectDraft = defineExpectBlock({ name: "expect-draft", checkpoint: Form, verify: [Trait.text("#status", "Draft")] });
const save = defineMethodBlock({
  name: "expect-save",
  from: Form,
  to: [Saved, Form],
  expect: { ExpectSaved: [ExpectToast, Shown.status.is("Saved")], ExpectForm: [ExpectDraft] },
  instruction: {
    async act(page, _in, mem) {
      if (mem.has(K.note)) await page.setContent(html("Saved"));
    },
    async observe(page) { return (await page.locator("#status").textContent()) === "Saved"; },
    resolve: (saved) => (saved ? Saved : Form),
  },
});
const engine = new Engine();
const run = (flow: { run(c: import("@playwright/test").BrowserContext, m: MemPage, o: { page: import("@playwright/test").Page }): Promise<unknown> }, page: import("@playwright/test").Page, mem = new MemPage()) =>
  flow.run(page.context(), mem, { page });

test("a Block's expectations run after it, for the outcome it landed on", async ({ page }) => {
  await expect(run(engine.map().method(open).method(save), page, new MemPage().set(K.note, "x"))).resolves.toEqual(Saved);
  await expect(run(engine.map().method(open).method(save), page)).resolves.toEqual(Form);
});

test("a step adds its own expectations; a failing step reports every one it didn't meet", async ({ page }) => {
  const flow = engine.map().method(open).method(save, { lands: Saved, expect: [Shown.status.is("Draft"), readEquals(Shown.rows, (rows) => rows.length === 3, "3 rows")] });
  const error = await run(flow, page, new MemPage().set(K.note, "x")).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ExpectFailure);
  const failure = error as ExpectFailure;
  expect(failure.checks.map((c) => c.trait)).toEqual(["read(expectShown.status)", "read(expectShown.rows)"]);
  expect(failure.message).toContain('wanted expectShown.status = "Draft"; saw "Saved"');
  expect(failure.message).toContain('wanted 3 rows; saw ["a","b"]');
});

test("{ expect: false } drops the Block's; map({ expect: false }) drops every step's", async ({ page }) => {
  const failing = defineMethodBlock({ name: "expect-failing", from: Form, to: Form, expect: [Shown.status.is("Nope")], instruction: { async act() {} } });
  await expect(run(engine.map().method(open).method(failing), page)).rejects.toThrow(ExpectFailure);
  await expect(run(engine.map().method(open).method(failing, { expect: false }), page)).resolves.toEqual(Form);
  await expect(run(engine.map({ expect: false }).method(open).method(failing, { expect: [Shown.status.is("Nope")] }), page)).resolves.toEqual(Form);
});

test("WAYGRAPH_NO_EXPECT (--no-expect) skips them for a run", async ({ page }) => {
  const failing = defineMethodBlock({ name: "expect-failing-env", from: Form, to: Form, expect: [Shown.status.is("Nope")], instruction: { async act() {} } });
  process.env.WAYGRAPH_NO_EXPECT = "1";
  try {
    await expect(run(engine.map().method(open).method(failing), page)).resolves.toEqual(Form);
  } finally {
    delete process.env.WAYGRAPH_NO_EXPECT;
  }
});

test("a step's expectations run at once: the step costs its slowest check, not the sum", async ({ page }) => {
  const slow = (name: string) => ({ name, check: async () => { await new Promise((r) => setTimeout(r, 700)); return true; } });
  const flow = engine.map().method(open, { expect: [slow("a"), slow("b"), slow("c")] });
  const started = Date.now();
  await run(flow, page);
  expect(Date.now() - started).toBeLessThan(1800);
});

test("an expectation may not change the page or mem", async ({ page }) => {
  const clicks = { name: "clicks", check: async (p: import("@playwright/test").Page) => { await p.locator("#name").click(); return true; } };
  const types = { name: "types", check: async (p: import("@playwright/test").Page) => { await p.keyboard.press("a"); return true; } };
  const sets = { name: "sets", check: async (_p: import("@playwright/test").Page, mem: MemPage) => { mem.set(K.note, "y"); return true; } };
  for (const [check, code, said] of [[clicks, "WG_EXPECT_CHANGED_PAGE", "locator.click()"], [types, "WG_EXPECT_CHANGED_PAGE", "keyboard.press()"], [sets, "WG_EXPECT_SET_MEM", 'mem key "expectSpec.note"']] as const) {
    const error = await run(engine.map().method(open, { expect: [check] }), page).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WaygraphError);
    expect((error as WaygraphError).code).toBe(code);
    expect((error as Error).message).toContain(said);
  }
  // After them, the page acts again as usual.
  await page.locator("#name").click();
  await page.keyboard.press("a");
});

test("each step in a flow runs its own expectations, not only the last", async ({ page }) => {
  const flow = engine.map().method(open, { expect: [ExpectDraft, Shown.status.is("Gone")] }).method(save, { lands: Form });
  await expect(run(flow, page)).rejects.toThrow(/^expect-open: an expectation didn't hold[\s\S]*expectShown\.status = "Gone"/);
});

test("expectations are typed to where the Block lands", () => {
  defineMethodBlock({
    name: "expect-typed",
    from: Form,
    // @ts-expect-error ExpectToast judges Saved, and this Block lands on Form
    to: Form,
    expect: [ExpectToast],
    instruction: { async act() {} },
  });
  defineMethodBlock({
    name: "expect-typed-outcome",
    from: Form,
    to: [Saved, Form],
    // @ts-expect-error per outcome: ExpectDraft judges Form, not Saved
    expect: { ExpectSaved: [ExpectDraft] },
    instruction: { async act() {}, resolve: () => Form },
  });
});
