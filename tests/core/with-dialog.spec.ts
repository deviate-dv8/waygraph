import { test, expect } from "@playwright/test";
import { Engine, start, end, checkpoint, key, MemPage, withDialog } from "../../src/index.js";
import type { Block, Checkpoint } from "../../src/index.js";

type Done = Checkpoint<"Done">;
const Warning = key<string>("test.warning");

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
  const flow = new Engine().defineFlow([start, withDialog(clickLeave, { into: Warning }), end]);
  await flow.run(context, mem, { page, closeOnFinish: false });
  expect(mem.get(Warning)).toBe("Leave anyway?");
  expect(await page.title()).toBe("left");
});

test("accept: false dismisses it", async ({ context }) => {
  const page = await context.newPage();
  await page.setContent(html);
  const flow = new Engine().defineFlow([start, withDialog(clickLeave, { accept: false }), end]);
  await flow.run(context, new MemPage(), { page, closeOnFinish: false });
  expect(await page.title()).toBe("stayed");
});
