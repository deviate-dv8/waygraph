import { test, expect } from "@playwright/test";
import { checkpoint, definePageBlock, MemPage } from "../../src/index.js";
import { runVerify } from "../../src/engine/trait/verify.js";

const Done = checkpoint("PageCheckDone");
const Lines = definePageBlock({
  name: "page-check-lines",
  checkpoint: "PageCheckLines",
  read: (ctx) => ({ rows: ctx.page.list(".r", (row) => ({ name: row.text(".n") })) }),
});

const html = (names: string[]) => `data:text/html,${names.map((n) => `<div class="r"><span class="n">${n}</span></div>`).join("")}`;

test("Page.check judges everything the page shows: true or false, or { ok, saw }", async ({ page }) => {
  await page.goto(html(["a-x", "b-x"]));
  const marked = Lines.check("only lines ending with -x", ({ rows }) => rows.every((r) => r.name.endsWith("-x")));
  await runVerify([marked], Done, page, new MemPage(), "list");
  await page.goto(html(["a-x", "other"]));
  await expect(runVerify([{ ...marked, timeoutMs: 200 }], Done, page, new MemPage(), "list")).rejects.toThrow(/only lines ending with -x/);
  const said = Lines.check("three rows", ({ rows }) => ({ ok: rows.length === 3, saw: `${rows.length} rows` }));
  await expect(runVerify([{ ...said, timeoutMs: 200 }], Done, page, new MemPage(), "list")).rejects.toThrow(/2 rows/);
});
