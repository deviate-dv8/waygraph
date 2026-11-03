import { test, expect } from "@playwright/test";
import { installGate } from "../../src/demo/stepper/gate.js";
import { newPacing } from "../../src/demo/stepper/pacing.js";
import type { WgPage } from "../../src/demo/types.js";

test("--auto-next advances on a page with no origin (no base URL): the flag decides when the page can't keep the checkbox", async ({ browser }) => {
  const before = { autoplay: process.env.WAYGRAPH_AUTOPLAY, ms: process.env.WAYGRAPH_AUTOPLAY_MS };
  process.env.WAYGRAPH_AUTOPLAY = "1";
  process.env.WAYGRAPH_AUTOPLAY_MS = "100";
  const context = await browser.newContext();
  try {
    // A new tab's blank document: no origin, so no localStorage.
    const page = (await context.newPage()) as WgPage;
    const gate = await installGate(page, newPacing(true), true);
    const started = Date.now();
    await expect(gate.wait()).resolves.toEqual({});
    expect(Date.now() - started).toBeLessThan(5000);
  } finally {
    await context.close();
    for (const [name, value] of [["WAYGRAPH_AUTOPLAY", before.autoplay], ["WAYGRAPH_AUTOPLAY_MS", before.ms]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
