import { test, expect } from "@playwright/test";
import { Engine, checkpoint, MemPage, withDialog, keys } from "../../src/index.js";
import type { Block, Checkpoint } from "../../src/index.js";
import { buildFlow } from "../../src/engine/flow/flow.js";

type Done = Checkpoint<"Done">;

const TestKeys = keys("test")<{
  warning: string;
}>();
const clickLeave: Block<Checkpoint<"__start__">, Done> = {
  name: "click-leave",
  instruction: {
    async act(page) {
      await page.locator("#leave").click();
    },
    resolve: () => checkpoint("Done"),
  },
};

const html = `<button id="leave" onclick="document.title = confirm('Leave anyway?') ? 'left' : 'stayed'">Leave</button>`;

test("withDialog answers the confirm the click opens and keeps its text in mem", async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(html);
  const mem = new MemPage();
  const flow = buildFlow([withDialog(clickLeave, { into: TestKeys.warning })], new Engine().config);
  await flow.run(context, mem, { page, closeOnFinish: false });
  expect(mem.get(TestKeys.warning)).toBe("Leave anyway?");
  expect(await page.title()).toBe("left");
});

test("accept: false dismisses it", async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(html);
  const flow = buildFlow([withDialog(clickLeave, { accept: false })], new Engine().config);
  await flow.run(context, new MemPage(), { page, closeOnFinish: false });
  expect(await page.title()).toBe("stayed");
});
