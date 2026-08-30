import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { Engine, start, end, MemPage, checkpoint } from "../src/index.js";

const FORM_URL = `data:text/html,${encodeURIComponent(`<h1 id="h">Hello</h1>`)}`;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

test.describe("Flow.run(mem) - Engine owns its own browser", () => {
  test("runs a real flow with no context given, using EngineConfig", async () => {
    const load: Block<Start, Done> = {
      name: "load",
      instruction: {
        async act(page) {
          await page.goto(FORM_URL);
        },
        resolve: () => checkpoint("Done"),
      },
    };

    // No Playwright `context` fixture used at all - the Engine launches, runs,
    // and closes its own browser for this call.
    const engine = new Engine({ headless: true });
    const flow = engine.defineFlow([start, load, end]);

    const result = await flow.run(new MemPage());

    expect(result).toEqual(checkpoint("Done"));
  });

  test("run(context, mem) still works exactly as before - config is only used when no context is given", async ({
    context,
  }) => {
    const load: Block<Start, Done> = {
      name: "load",
      instruction: {
        async act(page) {
          await page.goto(FORM_URL);
        },
        resolve: () => checkpoint("Done"),
      },
    };

    // headless: false here would be ignored, since a real context is provided -
    // Playwright's own config (headless: true) governs that context, not EngineConfig.
    const engine = new Engine({ headless: false });
    const flow = engine.defineFlow([start, load, end]);

    const result = await flow.run(context, new MemPage());

    expect(result).toEqual(checkpoint("Done"));
  });

  test("slowMo measurably slows down a run - proof it's actually passed to Playwright, not just accepted", async () => {
    const twoActions: Block<Start, Done> = {
      name: "two-actions",
      instruction: {
        async act(page) {
          await page.goto(FORM_URL);
          await page.locator("#h").click(); // a second real Playwright operation
        },
        resolve: () => checkpoint("Done"),
      },
    };

    const slowEngine = new Engine({ headless: true, slowMo: 150 });
    const start1 = Date.now();
    await slowEngine.defineFlow([start, twoActions, end]).run(new MemPage());
    const slowElapsed = Date.now() - start1;

    const fastEngine = new Engine({ headless: true });
    const start2 = Date.now();
    await fastEngine.defineFlow([start, twoActions, end]).run(new MemPage());
    const fastElapsed = Date.now() - start2;

    // Two operations, each delayed ~150ms by slowMo, should add at least one
    // full delay's worth of gap versus the un-delayed run - a generous bound
    // to avoid flaking on CI timing, not a precise measurement.
    expect(slowElapsed - fastElapsed).toBeGreaterThan(150);
  });

  test("run(mem, config) overrides the Engine's own config for just that call", async () => {
    const twoActions: Block<Start, Done> = {
      name: "two-actions",
      instruction: {
        async act(page) {
          await page.goto(FORM_URL);
          await page.locator("#h").click();
        },
        resolve: () => checkpoint("Done"),
      },
    };

    // Constructed with no slowMo at all - if the per-call override below is
    // actually applied (not just accepted and ignored), this run measurably
    // slows down anyway, the same proof used for the base EngineConfig case.
    const engine = new Engine({ headless: true });
    const flow = engine.defineFlow([start, twoActions, end]);

    // A cold browser launch is itself slow and highly variable - warm it up
    // once, untimed, so that cost doesn't swamp the ~150ms signal being measured.
    await flow.run(new MemPage());

    const start1 = Date.now();
    await flow.run(new MemPage());
    const baseline = Date.now() - start1;

    const start2 = Date.now();
    await flow.run(new MemPage(), { slowMo: 400 });
    const overridden = Date.now() - start2;

    // ~800ms expected (2 operations x 400ms) - asserting a third of that is a
    // wide margin against real system noise, which is what flaked this test
    // at a tighter 150ms threshold.
    expect(overridden - baseline).toBeGreaterThan(250);
  });
});
