import { test, expect } from "@playwright/test";
import { checkpoint, defineMethodBlock, defineReadBlock, Engine, keys, MemPage, reads, Start } from "../../src/index.js";
import { playSteps } from "../../src/runner/play-steps.js";
import type { PlayStep } from "../../src/runner/mode.js";
import type { WgPage } from "../../src/demo/types.js";

const Form = checkpoint("PlayStayForm");
const K = keys("playStay")<{ q: string }>();
const Shown = reads("playStay")<{ title: string }>();
defineReadBlock({ name: "read-play-stay", from: [Form], instruction: { read: (ctx) => Shown({ title: ctx.page.text("h1") }) } });

const open = defineMethodBlock({
  name: "play-stay-open",
  from: Start,
  to: Form,
  instruction: { async act(page) { await page.setContent("<h1>Form</h1>"); } },
});
const maybe = defineMethodBlock({ name: "play-stay-maybe", from: Form, to: Form, instruction: { async act() {} } });

test("run and demo play one step at a time: a step that stays where it is (.set, .expect, a skipped when) stays on the last step's Checkpoint", async ({ page, context }) => {
  const flow = new Engine()
    .map()
    .method(open)
    .set(K.q, "x")
    .method(maybe, { when: () => false })
    .expect(Shown.title, "Form");
  const steps: PlayStep[] = flow.blocks().map((info) => ({ block: info.block, exportName: "flow", config: {}, resetSession: false, segment: 0 }));
  const landed: string[] = [];
  const outcome = await playSteps(
    steps,
    { context, page: page as WgPage, mem: new MemPage(), baseURL: undefined },
    { name: "test", after: async (_i, result) => void landed.push(result.__state) },
    false,
  );
  expect(outcome.ok).toBe(true);
  expect(landed).toEqual(["PlayStayForm", "PlayStayForm", "PlayStayForm", "PlayStayForm"]);
});
