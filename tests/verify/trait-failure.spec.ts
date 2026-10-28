import { test, expect } from "@playwright/test";
import { checkpoint, defineMethodBlock, Engine, MemPage, onRunEvent, Trait, TraitFailure, type RunEvent, keys } from "../../src/index.js";
import { runVerify } from "../../src/engine/trait/verify.js";

const Saved = checkpoint("Saved");

test("a check that doesn't wait is retried until the page catches up", async ({ page }) => {
  await page.setContent(`<h1>Machines</h1><div class="toast"></div><script>setTimeout(() => document.querySelector(".toast").textContent = "Saved", 600)</script>`);
  await runVerify([Trait.text(".toast", "Saved")], Saved, page, new MemPage(), "save-machine");
});

test("a failed check says what it wanted, what the page showed, and where", async ({ page }) => {
  await page.setContent(`<h1>Equipment Registry</h1><div class="toast">Draft</div>`);
  const err = await runVerify([{ ...Trait.text(".toast", "Saved"), timeoutMs: 300 }], Saved, page, new MemPage(), "save-machine").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(TraitFailure);
  expect((err as Error).message).toBe('trait "text-equals(.toast, "Saved")" failed after "save-machine": wanted "Saved" in .toast; saw "Draft" (on about:blank "Equipment Registry")');
  expect((err as TraitFailure).check).toMatchObject({ trait: 'text-equals(.toast, "Saved")', block: "save-machine", when: "after", wants: '"Saved" in .toast', saw: '"Draft"', heading: "Equipment Registry" });
});

test("a custom check can say what it saw", async ({ page }) => {
  await page.setContent(`<table><tr><td>3</td></tr></table>`);
  const rows = { name: "five-rows", wants: "5 rows", timeoutMs: 200, async check(p: typeof page) { const n = await p.locator("tr").count(); return { ok: n === 5, saw: `${n} rows` }; } };
  await expect(runVerify([rows], Saved, page, new MemPage(), "list")).rejects.toThrow('trait "five-rows" failed after "list": wanted 5 rows; saw 1 rows');
});

test("the Traits for values, attributes, text inside, patterns and absence; expected values from mem", async ({ page }) => {
  await page.setContent(`<input id="name" value="Mixer 2"><input id="code" readonly value="MCH-0042"><p id="msg">Saved Mixer 2 at 09:30</p><span id="code-text">MCH-0042</span>`);
  const TestKeys = keys("test")<{
    name: string;
  }>();
  const mem = new MemPage();
  mem.set(TestKeys.name, "Mixer 2");
  await runVerify(
    [Trait.value("#name", (m) => m.get(TestKeys.name)), Trait.attribute("#code", "readonly", ""), Trait.contains("#msg", (m) => m.get(TestKeys.name)), Trait.matches("#code-text", /^MCH-\d{4}$/), Trait.absent("[data-testid=archive]"), Trait.text("#code-text", "MCH-0042")],
    Saved, page, mem, "check-all",
  );
  await expect(runVerify([{ ...Trait.absent("#name"), timeoutMs: 100 }], Saved, page, mem, "x")).rejects.toThrow("wanted no #name on the page; saw 1 of them");
});

test("a run's step:error carries the failed check as data", async ({ page }) => {
  await page.setContent(`<h1>Registry</h1><div class="toast">Draft</div>`);
  const save = defineMethodBlock({ name: "save", from: checkpoint("A"), to: Saved, instruction: { async act() {}, verify: [{ ...Trait.text(".toast", "Saved"), timeoutMs: 200 }] } });
  const events: RunEvent[] = [];
  const off = onRunEvent((e) => events.push(e));
  await new Engine().map().start().method(save as never).end().run(page.context(), new MemPage(), { page }).catch(() => {});
  off();
  const error = events.find((e) => e.type === "step:error") as Extract<RunEvent, { type: "step:error" }>;
  expect(error.check).toMatchObject({ trait: 'text-equals(.toast, "Saved")', block: "save", wants: '"Saved" in .toast', saw: '"Draft"', heading: "Registry" });
});
