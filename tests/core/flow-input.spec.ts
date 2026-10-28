import { test, expect } from "@playwright/test";
import { checkpoint, defineAssertBlock, defineMethodBlock, Engine, MemPage, Trait, keys } from "../../src/index.js";

const Start = checkpoint("__start__");
const Form = checkpoint("Form");
const Sent = checkpoint("Sent");

const TestKeys = keys("test")<{
  case: { url: string; body?: string };
}>();
const sent: string[] = [];

const open = defineMethodBlock({ name: "open-form", from: Start, to: Form, instruction: { async act() {} } });
const setBody = defineMethodBlock({
  name: "set-body",
  from: Form,
  to: Form,
  instruction: {
    async act(_p, _i, mem) { sent.push("body " + mem.get(TestKeys.case).body); },
    // Holds only when there is a body: verifying the skipped step (no body) would fail.
    verify: [{ name: "has-body", timeoutMs: 0, async check(_p, mem) { return mem.get(TestKeys.case).body !== undefined; } }],
  },
});
const send = defineMethodBlock({ name: "send", from: Form, to: Sent, instruction: { async act(_p, _i, mem) { sent.push("send " + mem.get(TestKeys.case).url); } } });
const engine = new Engine();
const caseFlow = engine
  .map({ input: TestKeys.case })
  .method(open)
  .method(setBody, { when: (mem) => mem.get(TestKeys.case).body !== undefined })
  .method(send)
  .end();

test.beforeEach(() => {
  sent.length = 0;
});

test("a skipped step ends where it started, without acting or verifying", async ({ page }) => {
  const mem = new MemPage();
  mem.set(TestKeys.case, { url: "/a" });
  expect(await caseFlow.run(page.context(), mem, { page })).toEqual(Sent);
  expect(sent).toEqual(["send /a"]);
});

test("a flow's input is required: preflight asks for it", async ({ page }) => {
  expect(caseFlow.input).toBe(TestKeys.case);
  await expect(caseFlow.run(page.context(), new MemPage(), { page })).rejects.toThrow(/"test\.case"/);
});

test(".flow(sub, { input }) plays one flow for several cases", async ({ page }) => {
  const sendAgain = defineMethodBlock({ name: "back-to-form", from: Sent, to: Start, instruction: { async act() {} } });
  const both = engine.map().flow(caseFlow, { input: { url: "/a" } }).method(sendAgain).flow(caseFlow, { input: { url: "/b", body: "{}" } }).end();
  await both.run(page.context(), new MemPage(), { page });
  expect(sent).toEqual(["send /a", "body {}", "send /b"]);
});

test("an input for a sub-flow that takes none is rejected", () => {
  const plain = engine.map().method(open).end();
  expect(() => engine.map().flow(plain, { input: 1 })).toThrow(/takes no input/);
});

test("when is only offered on a step that stays on its Checkpoint", () => {
  const map = engine.map().method(open);
  // @ts-expect-error send moves from Form to Sent: skipping it would leave the flow on Form
  map.method(send, { when: () => true });
  map.assert(defineAssertBlock({ name: "form-shown", checkpoint: Form, verify: [Trait.visible("form")] }), { when: () => false });
});
