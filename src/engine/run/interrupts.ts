// Interrupts: things that can appear on any page of a layout and get in the way (a cookie banner, a session-expiry warning,
// a survey). A layout names each with the locator that shows it and what to do about it; the run installs them on the page
// with Playwright's locator handlers, so whichever step is running when one appears is not blocked, and the run log (and
// the demo) say it happened. Installed per page, for the layouts that cover the page the step is on.
import type { Page } from "@playwright/test";
import { currentRunId, currentStep, interruptFired } from "./events.js";

/** One interrupt of a layout, as the run holds it. */
export interface InterruptDef {
  layout: string;
  name: string;
  when: string;
  run: (page: Page) => Promise<void>;
  /** Whether the layout covers the Checkpoint a step is on (every page until layouts are loaded). */
  covers: (checkpoint: string) => boolean;
}

const defs: Map<string, InterruptDef> = ((globalThis as { [k: symbol]: Map<string, InterruptDef> | undefined })[Symbol.for("waygraph.interrupts")] ??= new Map());
/** The handlers installed on a page: key -> remove. */
const installed = new WeakMap<Page, Map<string, () => Promise<void>>>();

/** Registers a layout's interrupts (a layout defined again replaces its own). */
export function registerInterrupts(list: readonly InterruptDef[]): void {
  for (const d of list) defs.set(`${d.layout}/${d.name}`, d);
}

/** Installs on `page` the interrupts of the layouts covering `checkpoint`, and removes those that no longer do. */
export async function syncInterrupts(page: Page, checkpoint: string): Promise<void> {
  if (defs.size === 0 && !installed.has(page)) return;
  const has = installed.get(page) ?? new Map<string, () => Promise<void>>();
  installed.set(page, has);
  for (const [key, def] of defs) {
    const want = def.covers(checkpoint);
    if (want && !has.has(key)) {
      const locator = page.locator(def.when);
      const runId = currentRunId();
      await page.addLocatorHandler(locator, async () => {
        const step = currentStep();
        await def.run(page);
        interruptFired(def.layout, def.name, runId, step ? { index: step.index } : undefined);
      });
      has.set(key, () => page.removeLocatorHandler(locator));
    } else if (!want) {
      const remove = has.get(key);
      if (remove) {
        await remove();
        has.delete(key);
      }
    }
  }
}
